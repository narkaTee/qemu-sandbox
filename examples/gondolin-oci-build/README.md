# Gondolin OCI example

Uses the Gondolin provider. The guest assets are built from a local Containerfile supplied by the config.

Requirements:

- Podman or Docker. `qemu-sandbox` auto-detects whichever is available.
- QEMU, as used by Gondolin.
- `rsync` in the guest image if you want to use `qemu-sandbox sync`.

```sh
qemu-sandbox
```
