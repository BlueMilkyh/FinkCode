#!/usr/bin/env bash
# bootstrap-upstream.sh — Phase 1 placeholder.
#
# Clones microsoft/vscode at the pinned tag into ./vscode/ (sibling of
# this script's parent dir). Idempotent: re-running checks out the
# pinned tag in the existing checkout.
#
# Real implementation lands in Phase 1 step 3. For now this script
# only documents the intended interface so callers (CI, contributors)
# know what to expect.

set -euo pipefail

VSCODE_TAG="${VSCODE_TAG:-1.95.0}"
TARGET_DIR="${TARGET_DIR:-vscode}"
UPSTREAM="${UPSTREAM:-https://github.com/microsoft/vscode.git}"

echo "[bootstrap-upstream] Phase 1 placeholder — not yet implemented."
echo "  pinned tag: $VSCODE_TAG"
echo "  target:     $TARGET_DIR"
echo "  upstream:   $UPSTREAM"
echo ""
echo "Next session will fill this in. See BUILD.md."
exit 0
