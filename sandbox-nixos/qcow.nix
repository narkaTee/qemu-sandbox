{ config, lib, pkgs, modulesPath, ... }:
{
  imports = [
    "${toString modulesPath}/profiles/qemu-guest.nix"
  ];

  fileSystems."/" = {
    device = "/dev/disk/by-label/nixos";
    autoResize = true;
    fsType = "ext4";
  };

  boot.growPartition = true;
  boot.kernelParams = [ "console=ttyS0" "root=LABEL=nixos" "rw" "quiet" ];
  boot.loader.grub.device = lib.mkDefault "/dev/vda";

  system.build.qcow2 = import "${modulesPath}/../lib/make-disk-image.nix" {
    inherit lib config pkgs;
    diskSize = 8192;
    format = "qcow2-compressed";
    partitionTableType = "hybrid";
    copyChannel = false;
  };
}
