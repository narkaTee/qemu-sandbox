import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, homedir } from "node:os";
import { join } from "node:path";
import { type BuildConfig, buildAssets, type ContainerRuntime } from "@earendil-works/gondolin";
import type { ProjectConfig } from "../../project-config.ts";

const IMAGE_DIR = join(homedir(), ".cache", "qemu-sandbox", "images", "gondolin-oci");

export function gondolinArch(): "x86_64" | "aarch64" {
  const a = arch();
  if (a === "x64") return "x86_64";
  if (a === "arm64") return "aarch64";
  throw new Error(`Unsupported architecture: ${a}`);
}

async function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ["--version"], { stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function detectOciBuilder(): Promise<ContainerRuntime> {
  // Keep this order aligned with Gondolin's OCI runtime auto-detection so locally built images are exported from the same runtime.
  for (const cmd of ["docker", "podman"] as const) {
    if (await commandExists(cmd)) return cmd;
  }
  throw new Error("Neither docker nor podman found. Install one to use gondolin.oci-build.");
}

async function runStreamed(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

async function buildOciImage(
  builder: ContainerRuntime,
  containerfilePath: string,
  tag: string,
  contextDir: string
): Promise<void> {
  console.log(`Building OCI image ${tag} from ${containerfilePath} using ${builder}...`);
  await runStreamed(builder, ["build", "-f", containerfilePath, "-t", tag, contextDir]);
}

export function gondolinBuildConfig(
  config: ProjectConfig,
  ociImage?: string,
  ociRuntime?: ContainerRuntime
): BuildConfig {
  return {
    arch: gondolinArch(),
    distro: "alpine",
    oci: {
      image: ociImage ?? config.settings.gondolin.oci,
      pullPolicy: "if-not-present",
      ...(ociRuntime ? { runtime: ociRuntime } : {}),
    },
    runtimeDefaults: {
      rootfsMode: "cow",
    },
  };
}

export function gondolinImageHash(buildConfig: BuildConfig): string {
  const h = createHash("sha256");
  h.update(JSON.stringify(buildConfig));
  return h.digest("hex").slice(0, 16);
}

export async function ensureGondolinImage(config: ProjectConfig): Promise<string> {
  let ociImage: string | undefined;
  let ociRuntime: ContainerRuntime | undefined;
  const ociBuild = config.settings.gondolin["oci-build"];
  if (ociBuild) {
    ociRuntime = await detectOciBuilder();
    const containerfilePath = join(config.localConfigDir, ociBuild);
    const containerfileContent = await readFile(containerfilePath, "utf-8");
    // Known quirk: only the Containerfile is hashed, so changes to other build-context files copied by the Containerfile may not invalidate this cache.
    const buildHash = createHash("sha256").update(containerfileContent).digest("hex").slice(0, 16);
    ociImage = `localhost/qemu-sandbox-gondolin:${buildHash}`;
  }

  const buildConfig = gondolinBuildConfig(config, ociImage, ociRuntime);
  const outputDir = join(IMAGE_DIR, `assets-${gondolinImageHash(buildConfig)}`);
  try {
    await readFile(join(outputDir, "manifest.json"));
    return outputDir;
  } catch {}

  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "build-config.json"), JSON.stringify(buildConfig, null, 2));

  if (ociBuild && ociRuntime && ociImage) {
    const containerfilePath = join(config.localConfigDir, ociBuild);
    await buildOciImage(ociRuntime, containerfilePath, ociImage, config.localConfigDir);
  }

  console.log(`Building Gondolin assets from ${ociImage ?? config.settings.gondolin.oci}...`);
  await buildAssets(buildConfig, {
    outputDir,
    verbose: true,
    workDir: join(outputDir, ".work"),
  });
  return outputDir;
}
