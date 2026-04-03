export interface ImageProvider {
  name: string;
  ensureBaseImage(): Promise<string>;
}
