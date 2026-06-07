# Gondolin OCI secrets and envs

Example configuration for environment variables and provider-aware secrets.

Gondolin secrets are exposed to the guest as placeholders and substituted by the host for the configured HTTP hosts. QEMU cannot enforce host-scoped secret injection, so each secret needs `qemu-fallback: env` to opt into exposing it as a normal guest environment variable.
