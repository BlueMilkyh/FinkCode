#!/usr/bin/env bash
# apply-patches.sh — applies our local diffs against the pinned upstream
# checkout. Patches live in ../patches/*.patch and are applied in
# lexicographic filename order.
#
# Idempotent: skips patches that are already applied (checked via
# `git apply --check --reverse`).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VSCODE_DIR="${VSCODE_DIR:-vscode}"
PATCH_DIR="${PATCH_DIR:-patches}"

cd "$REPO_ROOT"

if [ ! -d "$VSCODE_DIR" ]; then
  echo "[apply-patches] vscode/ missing — run bootstrap-upstream.sh first" >&2
  exit 1
fi

shopt -s nullglob
patches=("$PATCH_DIR"/*.patch)

if [ ${#patches[@]} -eq 0 ]; then
  echo "[apply-patches] no patches in $PATCH_DIR/ — nothing to do."
  exit 0
fi

cd "$VSCODE_DIR"
for patch in "${patches[@]}"; do
  patch_path="$REPO_ROOT/$patch"
  echo "[apply-patches] checking $(basename "$patch")"
  if git apply --check --reverse "$patch_path" 2>/dev/null; then
    echo "  already applied; skipping."
    continue
  fi
  if ! git apply --check "$patch_path" 2>/dev/null; then
    echo "  patch does not apply cleanly. Inspect manually:" >&2
    echo "    git -C $VSCODE_DIR apply --check $patch_path" >&2
    exit 1
  fi
  git apply "$patch_path"
  echo "  applied."
done

echo "[apply-patches] done. ${#patches[@]} patch(es) processed."
