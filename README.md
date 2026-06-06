# qemu-sandbox

QEMU-based development sandboxes. Spins up a Linux VM from your project directory with shared filesystem, SSH access, and IDE integration. Works on macOS and Linux.

## Prerequisites

- **QEMU** (`qemu-system-x86_64` or `qemu-system-aarch64`)
- **ISO tool** (Linux only): `genisoimage`, `mkisofs`, or `xorriso`
- **Docker or Podman** for the `gondolin` provider OCI image build
- **rsync** (for `sync` command)
- **Node.js** ≥ 23

## Install

```
npm install -g .
```

## Usage

```
qemu-sandbox [command]
```

Run `qemu-sandbox` in a project directory to start a VM and enter it via SSH. Each directory gets its own isolated sandbox.

### Commands

| Command      | Description                              |
|--------------|------------------------------------------|
| *(none)*     | Start VM and enter via SSH               |
| `code`       | Open in VS Code via Remote SSH           |
| `idea`       | Open in IntelliJ IDEA via Gateway        |
| `info`       | Show SSH connection details              |
| `list`/`ls`  | List all running sandboxes               |
| `bake`       | Prepare provider artifacts               |
| `stop`       | Stop sandbox for current directory       |
| `stop -a`    | Stop all running sandboxes               |
| `sync up`    | Upload current directory to sandbox      |
| `sync down`  | Download sandbox workspace to current directory |

## Configuration

Settings can be defined globally in `~/.config/qemu-sandbox/sandbox.yaml` and per-project in `.qemu-sandbox/sandbox.yaml`. Local settings override global ones.

### Global Configuration

Create `~/.config/qemu-sandbox/sandbox.yaml` for defaults that apply to all sandboxes:

```yaml
provider: qemu
memory: 8000
cpus: 4

qemu:
  image: debian-13
```

### Project Configuration

Place configuration files in a `.qemu-sandbox/` directory at the project root. Settings here override the global config.

### `.qemu-sandbox/sandbox.yaml`

Common settings plus provider-specific settings:

```yaml
mount-workspace: true

qemu:
  image: debian-13
```

```yaml
provider: gondolin
mount-workspace: true

gondolin:
  oci: ghcr.io/narkatee/sandbox-container:latest
```

| Field                  | Description                             | Default                                   |
|------------------------|-----------------------------------------|-------------------------------------------|
| `provider`             | Sandbox provider: `qemu` or `gondolin`  | `qemu`                                    |
| `cpus`                 | Number of virtual CPUs                  | auto                                      |
| `memory`               | Memory in MB                            | auto                                      |
| `mount-workspace`      | Mount project directory into VM         | `false`                                   |
| `mount-agent-configs`  | List of agent configs to mount          | `[]`                                      |
| `qemu.image`           | Base image name for QEMU                | `debian-13`                               |
| `gondolin.oci`         | OCI image for Gondolin assets           | `ghcr.io/narkatee/sandbox-container:latest` |
| `gondolin.oci-build`   | Local Containerfile to build OCI image   | —                                           |

Available QEMU images: `debian-13`, `nixos`.

The `gondolin` provider builds guest assets from the configured OCI image and exposes SSH.

> **⚠️ mount-workspace weakens the sandbox.** When enabled, the VM has direct read/write access to your project directory on the host via a shared mount. Anything running inside the VM can read, modify, or create executable files on your host disk. The `sync` command is disabled when this is active since files are already shared.

### `.qemu-sandbox/cloud-init.yaml`

QEMU-only. Standard [cloud-init](https://cloud-init.io/) configuration that is merged into the base cloud-init on boot. Use this to install packages, run setup scripts, add files, etc.

```yaml
packages:
  - ruby
  - vim
  - tmux
  - git
  - jq

runcmd:
  - curl -fsSL https://example.com/setup.sh | bash

write_files:
  - path: /home/dev/.config/example.conf
    content: |
      key=value
    owner: dev:dev
```

The custom config is merged with the following rules:
- Array fields (like `packages`, `runcmd`) are appended to the base config
- The `hostname` field is protected and cannot be overridden
- Custom `users` entries are merged, but the `dev` user cannot be redefined
- All other fields override the base config

### `.qemu-sandbox/mounts.yaml`

Additional host directories to mount into the VM:

```yaml
- host: ~/.config/asd
- host: ~/.config/foobar
- host: ../shared-libs
  guest: /home/dev/libs
  readonly: true
```

When `guest` is omitted, it is derived from the `host` path by mapping `~` to `/home/dev`. Relative paths without an explicit `guest` field will error.

> **Note:** The sandbox does not mount anything by default. All mounts must be explicitly configured.

### Agent Config Mounting

Automatically mount well-known coding agent configurations into the VM:

```yaml
mount-agent-configs:
  - claude
  - gemini
```

Supported agents:

| Agent     | Host path                      | Guest path                          |
|-----------|--------------------------------|-------------------------------------|
| `claude`  | `~/.claude/`                   | `/home/dev/.claude/`                |
| `claude`  | `~/.claude.json` (Only copied) | `/home/dev/.claude.json`            |
| `gemini`  | `~/.gemini`                    | `/home/dev/.gemini`                 |
| `opencode`| `~/.config/opencode`           | `/home/dev/.config/opencode`        |
| `pi`      | `~/.pi`                        | `/home/dev/.pi`                     |

Directories are mounted. Single files like `~/.claude.json` are copied into the VM after boot. Only paths that exist on the host are processed. Unknown agent names cause an error.

> **⚠️ This gives the VM read/write access to your agent credentials and configuration.**

## Baking

Running `qemu-sandbox bake` prepares artifacts for the selected provider.

### QEMU

For QEMU, `bake` creates or reuses a prepared image.

#### Debian / Cloud Images

Customization via `cloud-init.yaml`. The bake process boots the VM, runs cloud-init, and snapshots the result.

#### NixOS

The NixOS image is built with `nix build`. Customization is done via a NixOS module at `.qemu-sandbox/nixos.nix`:

```nix
{ pkgs, ... }:
{
  environment.systemPackages = with pkgs; [
    ripgrep
    fd
    jq
  ];

  services.postgresql.enable = true;
}
```

This is a standard NixOS module — you have full access to the NixOS option system.

The baked image is cached by the hash of `nixos.nix`. Changing the file triggers a rebuild on the next `qemu-sandbox bake` or `qemu-sandbox start`.

> **Note:** NixOS baking requires the `nix` CLI with flakes enabled. Add the following to `~/.config/nix/nix.conf` or `/etc/nix/nix.conf`:
>
> ```
> experimental-features = nix-command flakes
> ```

### Gondolin

For Gondolin, `bake` builds or reuses the OCI-derived guest assets. When `gondolin.oci-build` is set, `bake` also runs the Containerfile build first.

Instead of pulling a remote OCI image with `gondolin.oci`, you can build one locally from a Containerfile:

```yaml
provider: gondolin
mount-workspace: true

gondolin:
  oci-build: Containerfile
```

This runs `podman build` (or `docker build`, auto-detected) using the Containerfile in `.qemu-sandbox/` as the build context. The resulting image is then used to build the Gondolin guest assets.

The built image is tagged deterministically based on the Containerfile contents, so changes to the Containerfile trigger a rebuild automatically.

`gondolin.oci` and `gondolin.oci-build` are mutually exclusive — use one or the other.

**Guest image requirements:** The built image must include:

- `openssh` (with `sshd` at `/usr/sbin/sshd` and `ssh-keygen` at `/usr/bin/ssh-keygen`)
- `rsync`
- A `dev` user (UID 1000)

See the `examples/gondolin-oci-build*` directories for working Containerfiles.
