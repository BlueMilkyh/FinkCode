#!/usr/bin/env bash
# finkcode - dev launcher for FinkCode (POSIX equivalent of finkcode.bat).
#
# Usage:  finkcode <workdir>
#         finkcode .
#         finkcode

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FINKCODE_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
VSCODE_DIR="$FINKCODE_REPO/vscode"

case "$(uname -s)" in
  Darwin)
    EXE="$VSCODE_DIR/.build/electron/FinkCode.app/Contents/MacOS/Electron"
    ;;
  Linux)
    EXE="$VSCODE_DIR/.build/electron/finkcode"
    ;;
  *)
    EXE="$VSCODE_DIR/.build/electron/FinkCode"
    ;;
esac

if [ ! -x "$EXE" ]; then
  echo "[finkcode] dev binary missing: $EXE" >&2
  echo "[finkcode] run ./scripts/code.sh from $VSCODE_DIR once to build it." >&2
  exit 1
fi

WORKDIR=""
if [ $# -gt 0 ] && [ -n "${1:-}" ]; then
  WORKDIR="$(cd "$1" 2>/dev/null && pwd || echo "$1")"
  shift
fi

export NODE_ENV=development
export VSCODE_DEV=1
export VSCODE_CLI=1
export ELECTRON_ENABLE_LOGGING=1

cd "$VSCODE_DIR"
if [ -n "$WORKDIR" ]; then
  exec "$EXE" "$WORKDIR" --disable-extension=vscode.vscode-api-tests "$@"
else
  exec "$EXE" --disable-extension=vscode.vscode-api-tests "$@"
fi
