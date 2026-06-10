#!/bin/bash
# install-mcps.sh
# One-line installer for location-mcp and weather-mcp.
# Works around the npm 5-day first-time publish cooldown by pulling
# the prebuilt tarball directly from GitHub release assets.
#
# Usage:
#   curl -sSL https://github.com/atorresg/location-mcp/releases/latest/download/install.sh | bash
#   curl -sSL https://github.com/atorresg/location-mcp/releases/latest/download/install.sh | bash -s -- location weather
#   curl -sSL https://github.com/atorresg/location-mcp/releases/latest/download/install.sh | bash -s -- --dry-run
#
# Servers (default: install both): location, weather

set -euo pipefail

RELEASES_BASE="https://github.com/atorresg"

# server -> "owner/repo:asset-filename"
TARBALLS_LOCATION="location-mcp:location-mcp-0.1.1.tgz"
TARBALLS_WEATHER="weather-mcp:weather-mcp-1.0.2.tgz"
BIN_NAME_LOCATION="location-mcp"
BIN_NAME_WEATHER="weather-mcp"

DRY_RUN=false
SELECTED=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--dry-run) DRY_RUN=true; shift ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    location|weather) SELECTED+=("$1"); shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

[[ ${#SELECTED[@]} -eq 0 ]] && SELECTED=(location weather)

for cmd in npm node curl tar; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "❌ Required command not found: $cmd" >&2
    exit 1
  }
done

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "❌ Node.js >= 20 required (found: $(node -v))" >&2
  exit 1
fi

run() {
  if $DRY_RUN; then echo "[DRY-RUN] $*"; else "$@"; fi
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

for server in "${SELECTED[@]}"; do
  case "$server" in
    location)
      IFS=':' read -r repo asset <<< "$TARBALLS_LOCATION"
      bin="$BIN_NAME_LOCATION"
      ;;
    weather)
      IFS=':' read -r repo asset <<< "$TARBALLS_WEATHER"
      bin="$BIN_NAME_WEATHER"
      ;;
    *)
      echo "❌ Unknown server: $server" >&2
      continue
      ;;
  esac
  url="$RELEASES_BASE/$repo/releases/latest/download/$asset"
  tarball="$WORK/$asset"

  echo ""
  echo "📦 $server"
  echo "   $url"

  if ! run curl -fsSL -o "$tarball" "$url"; then
    echo "❌ Download failed." >&2
    continue
  fi

  echo "   Installing globally..."
  run npm install -g "$tarball"
  echo "✅ $server installed"
done

echo ""
echo "🎉 Done. Verify with:"
for s in "${SELECTED[@]}"; do
  case "$s" in
    location) bin="$BIN_NAME_LOCATION" ;;
    weather)  bin="$BIN_NAME_WEATHER"  ;;
  esac
  path=$(command -v "$bin" 2>/dev/null || echo "<install-prefix>/bin/$bin")
  echo "   $path"
done
echo ""
echo "For LM Studio / Claude Desktop, use the absolute path as 'command'."
