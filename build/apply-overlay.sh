#!/usr/bin/env bash
# apply-overlay.sh — overlays our FinkCode branding onto the upstream
# microsoft/vscode checkout.
#
# Real implementation lives in build/apply-overlay.js (Node script —
# easier deep-merge of product.json than shell). This wrapper exists
# so CI and contributors can call a stable filename regardless of
# which language we ended up writing the implementation in.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/apply-overlay.js" "$@"
