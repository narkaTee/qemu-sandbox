import type { ImageProvider } from "./provider.ts";
import { debianProvider } from "./debian.ts";
import { nixosProvider } from "./nixos.ts";

const providers: Record<string, ImageProvider> = {
  "debian-13": debianProvider,
  nixos: nixosProvider,
};

const DEFAULT_IMAGE = "debian-13";

export function resolveImage(name?: string | null): ImageProvider {
  const key = name ?? DEFAULT_IMAGE;
  const provider = providers[key];
  if (!provider) {
    const available = Object.keys(providers).join(", ");
    throw new Error(`Unknown image: ${key} (available: ${available})`);
  }
  return provider;
}
