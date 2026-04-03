import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { homedir, arch } from "node:os";
import { join } from "node:path";
import { sha512 } from "../sha512.ts";
import { download } from "../download.ts";
import type { ImageProvider } from "./provider.ts";

const BASE_URL = "https://cloud.debian.org/images/cloud/trixie/latest";
const CACHE_DIR = join(homedir(), ".cache", "qemu-sandbox", "images", "debian");

function getArch(): string {
  const a = arch();
  if (a === "x64") return "amd64";
  if (a === "arm64") return "arm64";
  throw new Error(`Unsupported architecture: ${a}`);
}

function imageFilename(): string {
  return `debian-13-genericcloud-${getArch()}.qcow2`;
}

function parseSha512Sums(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = line.match(/^([0-9a-f]+)\s+(.+)$/);
    if (match) entries.set(match[2], match[1]);
  }
  return entries;
}

async function fetchSha512Sums(): Promise<string> {
  const res = await fetch(`${BASE_URL}/SHA512SUMS`);
  if (!res.ok) throw new Error(`Failed to fetch SHA512SUMS: ${res.status}`);
  return res.text();
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function ensureDebianImage(): Promise<string> {
  const filename = imageFilename();
  const imagePath = join(CACHE_DIR, filename);
  const checksumsPath = join(CACHE_DIR, "SHA512SUMS");

  await mkdir(CACHE_DIR, { recursive: true });

  if (!(await fileExists(checksumsPath))) {
    console.log("Fetching SHA512SUMS...");
    await writeFile(checksumsPath, await fetchSha512Sums());
  }

  const sums = parseSha512Sums(await readFile(checksumsPath, "utf-8"));
  const expectedHash = sums.get(filename);
  if (!expectedHash)
    throw new Error(`No SHA512 checksum found for ${filename}`);

  if (await fileExists(imagePath)) {
    console.log(`Verifying cached image: ${imagePath}`);
    const actual = await sha512(imagePath);
    if (actual === expectedHash) {
      console.log("Checksum OK.");
      return imagePath;
    }
    console.log("Checksum mismatch, re-downloading...");
  }

  const url = `${BASE_URL}/${filename}`;
  console.log(`Downloading ${url}`);
  await download(url, imagePath);

  console.log("Verifying SHA512 checksum...");
  const actualHash = await sha512(imagePath);
  if (actualHash !== expectedHash) {
    await unlink(imagePath);
    throw new Error(
      `Checksum mismatch!\n  expected: ${expectedHash}\n  actual:   ${actualHash}`,
    );
  }
  console.log("Checksum OK.");

  return imagePath;
}

export const debianProvider: ImageProvider = {
  name: "debian-13",
  ensureBaseImage: ensureDebianImage,
};
