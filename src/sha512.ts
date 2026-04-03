import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function sha512(path: string): Promise<string> {
  const data = await readFile(path);
  return createHash("sha512").update(data).digest("hex");
}
