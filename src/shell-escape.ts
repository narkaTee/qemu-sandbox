export function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}
