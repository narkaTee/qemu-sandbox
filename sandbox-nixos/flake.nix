{
  description = "Sandbox NixOS KVM image";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/bcd464ccd2a1a7cd09aa2f8d4ffba83b761b1d0e";
  };

  outputs = { self, nixpkgs, ... }:
  let
    system = "x86_64-linux";
    cfg = self.nixosConfigurations.sandbox-kvm.config;
    pkgs = nixpkgs.legacyPackages.${system};
  in {
    nixosModules.default = { imports = [ ./nixos-qemu.nix ./qcow.nix ]; };

    nixosConfigurations.sandbox-kvm = nixpkgs.lib.nixosSystem {
      inherit system;
      modules = [
        self.nixosModules.default
      ];
    };

    packages.${system}.default = pkgs.runCommand "sandbox-kvm-image" {} ''
      mkdir -p $out
      ln -s ${cfg.system.build.qcow2}/nixos.qcow2 $out/disk.qcow2
    '';
  };
}
