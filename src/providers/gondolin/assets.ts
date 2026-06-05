import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { arch, homedir } from "node:os";
import { join } from "node:path";
import { buildAssets, type BuildConfig } from "@earendil-works/gondolin";
import type { ProjectConfig } from "../../project-config.ts";

const IMAGE_DIR = join(
  homedir(),
  ".cache",
  "qemu-sandbox",
  "images",
  "gondolin-oci",
);

export function gondolinArch(): "x86_64" | "aarch64" {
  const a = arch();
  if (a === "x64") return "x86_64";
  if (a === "arm64") return "aarch64";
  throw new Error(`Unsupported architecture: ${a}`);
}

export function gondolinBuildConfig(config: ProjectConfig): BuildConfig {
  return {
    arch: gondolinArch(),
    distro: "alpine",
    oci: {
      image: config.settings.gondolin.oci,
      pullPolicy: "if-not-present",
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

export async function ensureGondolinImage(
  config: ProjectConfig,
): Promise<string> {
  const buildConfig = gondolinBuildConfig(config);
  const outputDir = join(IMAGE_DIR, `assets-${gondolinImageHash(buildConfig)}`);
  try {
    await readFile(join(outputDir, "manifest.json"));
    return outputDir;
  } catch {}

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "build-config.json"),
    JSON.stringify(buildConfig, null, 2),
  );
  console.log(
    `Building Gondolin OCI image from ${config.settings.gondolin.oci}...`,
  );
  await buildAssets(buildConfig, {
    outputDir,
    verbose: true,
    workDir: join(outputDir, ".work"),
  });
  return outputDir;
}
