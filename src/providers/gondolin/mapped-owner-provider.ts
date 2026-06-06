import type { VfsStatfs, VirtualFileHandle, VirtualProvider } from "@earendil-works/gondolin";

function mapStats<T extends { uid: number; gid: number; mode: number }>(stats: T, uid: number, gid: number): T {
  const mapped = Object.create(Object.getPrototypeOf(stats)) as T;
  Object.assign(mapped, stats, { uid, gid });
  return mapped;
}

function mapHandleStats(handle: VirtualFileHandle, uid: number, gid: number): VirtualFileHandle {
  return {
    ...handle,
    stat: async (options?: object) => mapStats(await handle.stat(options), uid, gid),
    statSync: (options?: object) => mapStats(handle.statSync(options), uid, gid),
  };
}

export class MappedOwnerProvider implements VirtualProvider {
  private readonly backend: VirtualProvider;
  private readonly uid: number;
  private readonly gid: number;

  constructor(backend: VirtualProvider, uid: number, gid: number) {
    this.backend = backend;
    this.uid = uid;
    this.gid = gid;
  }

  get readonly(): boolean {
    return this.backend.readonly;
  }

  get supportsSymlinks(): boolean {
    return this.backend.supportsSymlinks;
  }

  get supportsWatch(): boolean {
    return this.backend.supportsWatch;
  }

  async open(path: string, flags: string, mode?: number): Promise<VirtualFileHandle> {
    return mapHandleStats(await this.backend.open(path, flags, mode), this.uid, this.gid);
  }

  openSync(path: string, flags: string, mode?: number): VirtualFileHandle {
    return mapHandleStats(this.backend.openSync(path, flags, mode), this.uid, this.gid);
  }

  async stat(path: string, options?: object): Promise<import("node:fs").Stats> {
    return mapStats(await this.backend.stat(path, options), this.uid, this.gid);
  }

  statSync(path: string, options?: object): import("node:fs").Stats {
    return mapStats(this.backend.statSync(path, options), this.uid, this.gid);
  }

  async lstat(path: string, options?: object): Promise<import("node:fs").Stats> {
    return mapStats(await this.backend.lstat(path, options), this.uid, this.gid);
  }

  lstatSync(path: string, options?: object): import("node:fs").Stats {
    return mapStats(this.backend.lstatSync(path, options), this.uid, this.gid);
  }

  readdir(path: string, options?: object): Promise<Array<string | import("node:fs").Dirent>> {
    return this.backend.readdir(path, options);
  }

  readdirSync(path: string, options?: object): Array<string | import("node:fs").Dirent> {
    return this.backend.readdirSync(path, options);
  }

  mkdir(path: string, options?: object): Promise<undefined | string> {
    return this.backend.mkdir(path, options) as Promise<undefined | string>;
  }

  mkdirSync(path: string, options?: object): undefined | string {
    return this.backend.mkdirSync(path, options) as undefined | string;
  }

  rmdir(path: string): Promise<void> {
    return this.backend.rmdir(path);
  }

  rmdirSync(path: string): void {
    this.backend.rmdirSync(path);
  }

  unlink(path: string): Promise<void> {
    return this.backend.unlink(path);
  }

  unlinkSync(path: string): void {
    this.backend.unlinkSync(path);
  }

  rename(oldPath: string, newPath: string): Promise<void> {
    return this.backend.rename(oldPath, newPath);
  }

  renameSync(oldPath: string, newPath: string): void {
    this.backend.renameSync(oldPath, newPath);
  }

  link(existingPath: string, newPath: string): Promise<void> {
    if (!this.backend.link) throw new Error("link not supported");
    return this.backend.link(existingPath, newPath);
  }

  linkSync(existingPath: string, newPath: string): void {
    if (!this.backend.linkSync) throw new Error("linkSync not supported");
    this.backend.linkSync(existingPath, newPath);
  }

  readFile(path: string, options?: { encoding?: BufferEncoding } | BufferEncoding): Promise<Buffer | string> {
    if (!this.backend.readFile) return this.backend.open(path, "r").then((h) => h.readFile(options));
    return this.backend.readFile(path, options);
  }

  readFileSync(path: string, options?: { encoding?: BufferEncoding } | BufferEncoding): Buffer | string {
    if (!this.backend.readFileSync) return this.backend.openSync(path, "r").readFileSync(options);
    return this.backend.readFileSync(path, options);
  }

  writeFile(
    path: string,
    data: Buffer | string,
    options?: { encoding?: BufferEncoding; mode?: number }
  ): Promise<void> {
    if (!this.backend.writeFile)
      return this.backend.open(path, "w", options?.mode).then((h) => h.writeFile(data, options));
    return this.backend.writeFile(path, data, options);
  }

  writeFileSync(path: string, data: Buffer | string, options?: { encoding?: BufferEncoding; mode?: number }): void {
    if (!this.backend.writeFileSync) {
      this.backend.openSync(path, "w", options?.mode).writeFileSync(data, options);
      return;
    }
    this.backend.writeFileSync(path, data, options);
  }

  appendFile(
    path: string,
    data: Buffer | string,
    options?: { encoding?: BufferEncoding; mode?: number }
  ): Promise<void> {
    if (!this.backend.appendFile)
      return this.backend.open(path, "a", options?.mode).then((h) => h.writeFile(data, options));
    return this.backend.appendFile(path, data, options);
  }

  appendFileSync(path: string, data: Buffer | string, options?: { encoding?: BufferEncoding; mode?: number }): void {
    if (!this.backend.appendFileSync) {
      this.backend.openSync(path, "a", options?.mode).writeFileSync(data, options);
      return;
    }
    this.backend.appendFileSync(path, data, options);
  }

  exists(path: string): Promise<boolean> {
    if (!this.backend.exists)
      return this.backend.stat(path).then(
        () => true,
        () => false
      );
    return this.backend.exists(path);
  }

  existsSync(path: string): boolean {
    if (!this.backend.existsSync) {
      try {
        this.backend.statSync(path);
        return true;
      } catch {
        return false;
      }
    }
    return this.backend.existsSync(path);
  }

  copyFile(src: string, dest: string, mode?: number): Promise<void> {
    if (!this.backend.copyFile) throw new Error("copyFile not supported");
    return this.backend.copyFile(src, dest, mode);
  }

  copyFileSync(src: string, dest: string, mode?: number): void {
    if (!this.backend.copyFileSync) throw new Error("copyFileSync not supported");
    this.backend.copyFileSync(src, dest, mode);
  }

  internalModuleStat(path: string): number {
    return this.backend.internalModuleStat?.(path) ?? 0;
  }

  realpath(path: string, options?: object): Promise<string> {
    if (!this.backend.realpath) return Promise.resolve(path);
    return this.backend.realpath(path, options);
  }

  realpathSync(path: string, options?: object): string {
    if (!this.backend.realpathSync) return path;
    return this.backend.realpathSync(path, options);
  }

  access(path: string, mode?: number): Promise<void> {
    if (!this.backend.access) return Promise.resolve();
    return this.backend.access(path, mode);
  }

  accessSync(path: string, mode?: number): void {
    this.backend.accessSync?.(path, mode);
  }

  readlink(path: string, options?: object): Promise<string> {
    if (!this.backend.readlink) throw new Error("readlink not supported");
    return this.backend.readlink(path, options);
  }

  readlinkSync(path: string, options?: object): string {
    if (!this.backend.readlinkSync) throw new Error("readlinkSync not supported");
    return this.backend.readlinkSync(path, options);
  }

  symlink(target: string, path: string, type?: string): Promise<void> {
    if (!this.backend.symlink) throw new Error("symlink not supported");
    return this.backend.symlink(target, path, type);
  }

  symlinkSync(target: string, path: string, type?: string): void {
    if (!this.backend.symlinkSync) throw new Error("symlinkSync not supported");
    this.backend.symlinkSync(target, path, type);
  }

  statfs(path: string): Promise<VfsStatfs> {
    if (!this.backend.statfs) throw new Error("statfs not supported");
    return this.backend.statfs(path);
  }

  watch(path: string, options?: object): unknown {
    return this.backend.watch?.(path, options);
  }

  watchAsync(path: string, options?: object): unknown {
    return this.backend.watchAsync?.(path, options);
  }

  watchFile(path: string, options?: object, listener?: (...args: unknown[]) => void): unknown {
    return this.backend.watchFile?.(path, options, listener);
  }

  unwatchFile(path: string, listener?: (...args: unknown[]) => void): void {
    this.backend.unwatchFile?.(path, listener);
  }
}
