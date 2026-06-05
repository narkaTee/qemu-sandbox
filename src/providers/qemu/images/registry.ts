import type { QemuImage } from "./types.ts";
import { debianImage } from "./debian.ts";
import { nixosImage } from "./nixos.ts";
import type { QemuImageName } from "../../../project-config.ts";

const images: Record<QemuImageName, QemuImage> = {
  "debian-13": debianImage,
  nixos: nixosImage,
};

export function resolveQemuImage(name: QemuImageName): QemuImage {
  const image = images[name];
  if (!image) {
    const available = Object.keys(images).join(", ");
    throw new Error(`Unknown QEMU image: ${name} (available: ${available})`);
  }
  return image;
}
