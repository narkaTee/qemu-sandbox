# Configuration examples

Each example is a small project directory with a `.qemu-sandbox` configuration.
Copy one into a project or run `qemu-sandbox` from inside the example directory.

## Examples

- `qemu-debian` — QEMU provider with the Debian cloud image and cloud-init customization.
- `qemu-nixos` — QEMU provider with the NixOS image and a NixOS module.
- `gondolin-oci` — Gondolin provider built from `ghcr.io/narkatee/sandbox-container:latest`.
- `gondolin-oci-build` — Gondolin provider built from a local Containerfile (Debian-based).
- `gondolin-oci-build-archlinux` — Gondolin provider built from a local Containerfile (Arch Linux-based).
- `gondolin-oci-secrets-and-envs` — proposed env var, dotenv, command, and provider-aware secret handling.
- `mounts-and-agent-configs` — host mounts, readonly mounts, workspace mount, and agent config mounting.

## Usage

```sh
cd examples/qemu-debian
qemu-sandbox
```

Or copy the `.qemu-sandbox` directory into your own project.
