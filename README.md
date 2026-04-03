# qemu-sandbox

QEMU-based development sandboxes. Spins up a Linux VM from your project directory with shared filesystem, SSH access, and IDE integration. Works on macOS and Linux.

## Prerequisites

- **QEMU** (`qemu-system-x86_64` or `qemu-system-aarch64`)
- **ISO tool** (Linux only): `genisoimage`, `mkisofs`, or `xorriso`
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
| `list`       | List all running sandboxes               |
| `bake`       | Pre-bake image with cloud-init config    |
| `stop`       | Stop sandbox for current directory       |
| `stop -a`    | Stop all running sandboxes               |
| `sync up`    | Upload current directory to sandbox      |
| `sync down`  | Download sandbox workspace to current directory |

## Configuration

Settings can be defined globally in `~/.config/qemu-sandbox/sandbox.yaml` and per-project in `.qemu-sandbox/sandbox.yaml`. Local settings override global ones.

### Global Configuration

Create `~/.config/qemu-sandbox/sandbox.yaml` for defaults that apply to all sandboxes:

```yaml
memory: 8000
cpus: 4
mount-workspace: true
```

### Project Configuration

Place configuration files in a `.qemu-sandbox/` directory at the project root. Settings here override the global config.

### `.qemu-sandbox/sandbox.yaml`

VM settings:

```yaml
cpus: 4
memory: 8000
image: debian-13
mount-workspace: true
```

| Field              | Description                          | Default     |
|--------------------|--------------------------------------|-------------|
| `cpus`             | Number of virtual CPUs               | auto        |
| `memory`           | Memory in MB                         | auto        |
| `image`            | Base image name                      | `debian-13` |
| `mount-workspace`  | Mount project directory into VM      | `false`     |

> **⚠️ mount-workspace weakens the sandbox.** When enabled, the VM has direct read/write access to your project directory on the host via a virtio-9p mount. Anything running inside the VM can read, modify, or create executable files on your host disk. The `sync` command is disabled when this is active since files are already shared.

### `.qemu-sandbox/cloud-init.yaml`

Standard [cloud-init](https://cloud-init.io/) configuration that is merged into the base cloud-init on boot. Use this to install packages, run setup scripts, add files, etc.

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

Additional host directories to mount into the VM via virtio-9p:

```yaml
- host: ~/.config/asd
- host: ~/.config/foobar
- host: ../shared-libs
  guest: /home/dev/libs
  readonly: true
```

When `guest` is omitted, it is derived from the `host` path by mapping `~` to `/home/dev`. Relative paths without an explicit `guest` field will error.

> **Note:** The sandbox does not mount anything by default. All mounts must be explicitly configured.

## Baking

Running `qemu-sandbox bake` creates a snapshot image with all cloud-init provisioning already applied. Subsequent `qemu-sandbox` starts use the baked image, skipping the cloud-init boot phase. The baked image is cached and rebuilt automatically when `cloud-init.yaml` or the base image changes.
