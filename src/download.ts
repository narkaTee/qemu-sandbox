import { rename, writeFile } from "node:fs/promises";

export async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  if (!res.body) throw new Error(`No response body: ${url}`);

  const tmp = `${dest}.tmp`;
  const chunks: Buffer[] = [];
  let downloaded = 0;

  for await (const chunk of res.body) {
    const buf = Buffer.from(chunk);
    chunks.push(buf);
    downloaded += buf.length;
    const mb = (downloaded / 1024 / 1024).toFixed(0);
    process.stdout.write(`\rDownloading... ${mb} MB`);
  }
  process.stdout.write("\n");

  await writeFile(tmp, Buffer.concat(chunks));
  await rename(tmp, dest);
}
