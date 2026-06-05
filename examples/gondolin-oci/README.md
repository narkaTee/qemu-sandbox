# Gondolin OCI example

Uses the Gondolin provider. The guest assets are built from:

```text
ghcr.io/narkatee/sandbox-container:latest
```

Requirements:

- Docker or Podman for the first OCI rootfs export/build.
- QEMU, as used by Gondolin.

```sh
qemu-sandbox
```
