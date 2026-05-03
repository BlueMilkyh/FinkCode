#!/usr/bin/env bash
# apply-patches.sh — Phase 1 placeholder.
#
# Iterates ../patches/*.patch and applies each via `git apply` in the
# upstream checkout.

set -euo pipefail

VSCODE_DIR="${VSCODE_DIR:-vscode}"
PATCH_DIR="${PATCH_DIR:-patches}"

echo "[apply-patches] Phase 1 placeholder — not yet implemented."
echo "  vscode dir: $VSCODE_DIR"
echo "  patch dir:  $PATCH_DIR"
echo ""
echo "Next session will fill this in. See BUILD.md."
exit 0
