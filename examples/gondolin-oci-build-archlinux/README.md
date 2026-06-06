# Gondolin OCI build example: Arch Linux

Uses the Gondolin provider with a local `Containerfile` based on Arch Linux.

The image includes the guest requirements for `qemu-sandbox`, including:

- `openssh`
- `rsync`
- a pre-created `dev` user

```sh
qemu-sandbox
```
