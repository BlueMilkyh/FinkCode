#!/usr/bin/env bash
# bootstrap-upstream.sh — clones microsoft/vscode at the pinned tag
# into ./vscode/ (sibling of this script's parent).
#
# Idempotent: re-running on an existing checkout fetches the pinned
# tag and resets the working tree — useful for picking up upstream
# patch releases without nuking node_modules.

set -euo pipefail

VSCODE_TAG="${VSCODE_TAG:-1.117.0}"
TARGET_DIR="${TARGET_DIR:-vscode}"
UPSTREAM="${UPSTREAM:-https://github.com/microsoft/vscode.git}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$REPO_ROOT/$TARGET_DIR"

if [ -d "$DEST/.git" ]; then
  echo "[bootstrap-upstream] Re-using existing checkout at $DEST"
  echo "[bootstrap-upstream] Fetching tag $VSCODE_TAG..."
  git -C "$DEST" fetch --depth 1 origin "tag" "$VSCODE_TAG"
  git -C "$DEST" reset --hard "tags/$VSCODE_TAG"
else
  echo "[bootstrap-upstream] Cloning $UPSTREAM at $VSCODE_TAG into $DEST..."
  git clone --depth 1 --branch "$VSCODE_TAG" "$UPSTREAM" "$DEST"
fi

CURRENT_TAG="$(git -C "$DEST" describe --tags --exact-match 2>/dev/null || echo "?")"
echo "[bootstrap-upstream] Done. Pinned to: $CURRENT_TAG"
