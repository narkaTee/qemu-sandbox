{ pkgs, ... }:
{
  environment.systemPackages = with pkgs; [
    fd
    git
    jq
    ripgrep
    tmux
  ];

  environment.etc."qemu-sandbox-example".text = "NixOS sandbox ready\n";
}
