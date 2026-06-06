import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { exec } from "../../../exec.ts";
import type { QemuImage, QemuImageResult } from "./types.ts";
import type { ProjectConfig } from "../../../project-config.ts";
import { customNixosModulePath } from "../config.ts";

const FLAKE_DIR = resolve(import.meta.dirname ?? "", "../../../../sandbox-nixos");
const BAKED_DIR = join(homedir(), ".cache", "qemu-sandbox", "images", "nixos");

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false
  );
}

export function nixBakeHash(customModule: string | null): string {
  const h = createHash("sha256");
  h.update(customModule ?? "");
  return h.digest("hex").slice(0, 16);
}

async function buildBaseImage(): Promise<string> {
  console.log("Building NixOS base image...");
  const { stdout } = await exec("nix", ["build", `${FLAKE_DIR}#default`, "--no-link", "--print-out-paths"]);
  const outDir = stdout.trim();
  return join(outDir, "disk.qcow2");
}

async function buildWithCustomModule(customModulePath: string): Promise<string> {
  console.log("Building NixOS image with custom module...");

  const wrapperFlake = `{
  inputs.base.url = "path:${FLAKE_DIR}";

  outputs = { self, base, ... }:
  let
    system = "x86_64-linux";
    pkgs = base.inputs.nixpkgs.legacyPackages.\${system};
    cfg = self.nixosConfigurations.sandbox-kvm.config;
  in {
    nixosConfigurations.sandbox-kvm = base.inputs.nixpkgs.lib.nixosSystem {
      inherit system;
      modules = [
        base.nixosModules.default
        ./custom.nix
      ];
    };

    packages.\${system}.default = pkgs.runCommand "sandbox-kvm-image" {} ''
      mkdir -p $out
      ln -s \${cfg.system.build.qcow2}/nixos.qcow2 $out/disk.qcow2
    '';
  };
}`;

  const tmpDir = join(BAKED_DIR, "wrapper-flake");
  await mkdir(tmpDir, { recursive: true });
  await writeFile(join(tmpDir, "flake.nix"), wrapperFlake);
  await copyFile(customModulePath, join(tmpDir, "custom.nix"));
  await exec("nix", ["flake", "update", "--flake", tmpDir]);

  const { stdout } = await exec("nix", ["build", `${tmpDir}#default`, "--no-link", "--print-out-paths"]);
  const outDir = stdout.trim();
  return join(outDir, "disk.qcow2");
}

async function bakeNixos(config: ProjectConfig): Promise<QemuImageResult> {
  const customModulePath = customNixosModulePath(config);
  const hasCustom = await fileExists(customModulePath);

  const customContent = hasCustom ? await readFile(customModulePath, "utf-8") : null;

  const hash = nixBakeHash(customContent);
  const bakedPath = join(BAKED_DIR, `baked-${hash}.qcow2`);

  if (await fileExists(bakedPath)) {
    console.log(`Using baked NixOS image: ${bakedPath}`);
    return { diskImage: bakedPath, useFwCfg: true };
  }

  await mkdir(BAKED_DIR, { recursive: true });

  let sourceImage: string;
  if (hasCustom) {
    sourceImage = await buildWithCustomModule(customModulePath);
  } else {
    sourceImage = await buildBaseImage();
  }

  await copyFile(sourceImage, bakedPath);
  console.log(`NixOS image ready: ${bakedPath}`);
  return { diskImage: bakedPath, useFwCfg: true };
}

export const nixosImage: QemuImage = {
  name: "nixos",
  bake: bakeNixos,
};
