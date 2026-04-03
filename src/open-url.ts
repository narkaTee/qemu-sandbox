import { execFile } from "node:child_process";

export function openUrl(url: string): Promise<void> {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  return new Promise((resolve, reject) => {
    execFile(cmd, [url], (err) => {
      if (err) {
        console.error(`Please open this URL manually:\n${url}`);
        reject(new Error(`Failed to open URL: ${err.message}`));
        return;
      }
      resolve();
    });
  });
}
