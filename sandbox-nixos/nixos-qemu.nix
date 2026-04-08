{ lib, pkgs, ... }:

let
  fwcfgBase = "/sys/firmware/qemu_fw_cfg/by_name/opt/com.sandbox";
in
{
  system.stateVersion = "25.11";

  networking.hostName = "kvm-sandbox";

  nix.settings = {
    experimental-features = [ "nix-command" "flakes" ];
    trusted-users = [ "root" "dev" ];
    accept-flake-config = true;
  };

  users.groups.dev = { };
  users.users.dev = {
    isNormalUser = true;
    group = "dev";
    extraGroups = [ "wheel" ];
    shell = pkgs.bashInteractive;
    initialPassword = "dev";
  };

  security.sudo.wheelNeedsPassword = false;

  environment.systemPackages = with pkgs; [
    bashInteractive
    coreutils
    devenv
    nodejs_22
    openssh
    tmux
  ];

  services.openssh = {
    enable = true;
    ports = [ 22 ];
    settings = {
      PermitRootLogin = "no";
      PasswordAuthentication = false;
      X11Forwarding = false;
      PrintMotd = false;
      AllowUsers = [ "dev" ];
    };
  };

  boot.kernelModules = [ "qemu_fw_cfg" "9p" "9pnet" "9pnet_virtio" ];
  boot.initrd.availableKernelModules = [ "9p" "9pnet_virtio" "virtio_pci" "virtio_blk" "virtio_net" ];

  systemd.tmpfiles.rules = [
    "d /home/dev/workspace 0755 dev dev -"
    "d /home/dev/.ssh 0700 dev dev -"
  ];

  systemd.services.update-hostname = {
    description = "Change host name based on QEMU fw_cfg value";
    after = [ "network.target" ];
    wantedBy = [ "multi-user.target" ];
    unitConfig.ConditionPathExists = "${fwcfgBase}/hostname/raw";
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    script = ''
      ${pkgs.systemd}/bin/hostnamectl set-hostname "$(${pkgs.coreutils}/bin/cat ${fwcfgBase}/hostname/raw)"
    '';
  };

  systemd.services.setup-proxy = {
    description = "Setup proxy from QEMU fw_cfg";
    after = [ "network.target" ];
    wantedBy = [ "multi-user.target" ];
    unitConfig.ConditionPathExists = "${fwcfgBase}/proxy/raw";
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    script = ''
      proxy="$(${pkgs.coreutils}/bin/cat ${fwcfgBase}/proxy/raw)"

      cat > /etc/environment <<EOF
HTTP_PROXY=$proxy
HTTPS_PROXY=$proxy
http_proxy=$proxy
https_proxy=$proxy
no_proxy=localhost,127.0.0.1
NO_PROXY=localhost,127.0.0.1
EOF

      install -d -m 0755 /etc/systemd/system/nix-daemon.service.d

      cat > /etc/systemd/system/nix-daemon.service.d/proxy.conf <<EOF
[Service]
Environment="HTTP_PROXY=$proxy"
Environment="HTTPS_PROXY=$proxy"
Environment="http_proxy=$proxy"
Environment="https_proxy=$proxy"
Environment="NO_PROXY=localhost,127.0.0.1"
Environment="no_proxy=localhost,127.0.0.1"
EOF

      ${pkgs.systemd}/bin/systemctl daemon-reload
      ${pkgs.systemd}/bin/systemctl restart nix-daemon.service || true
    '';
  };

  systemd.services.dev-ssh-keys = {
    description = "Set up SSH authorized_keys from QEMU fw_cfg";
    after = [ "network.target" "sshd.service" ];
    wants = [ "network.target" ];
    wantedBy = [ "multi-user.target" ];
    unitConfig.ConditionPathExists = "${fwcfgBase}/ssh_keys/raw";
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    script = ''
      ${pkgs.coreutils}/bin/cat ${fwcfgBase}/ssh_keys/raw | ${pkgs.coreutils}/bin/base64 -d > /home/dev/.ssh/authorized_keys
      chmod 0600 /home/dev/.ssh/authorized_keys
      chown dev:dev /home/dev/.ssh/authorized_keys
    '';
  };

  systemd.mounts = [
    {
      what = "workspace";
      where = "/home/dev/workspace";
      type = "9p";
      options = "trans=virtio";
      mountConfig.TimeoutSec = "10";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
    }
  ];

  systemd.services."serial-getty@ttyS0".serviceConfig.ExecStart = lib.mkForce [
    ""
    "${pkgs.util-linux}/sbin/agetty --autologin dev --noreset --noclear --keep-baud 115200,57600,38400,9600 - tmux-256color"
  ];
}
