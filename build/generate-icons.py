#!/usr/bin/env python3
"""generate-icons.py — convert assets/finkcode-logo.png into the
platform-specific icon files VSCode's build expects.

Idempotent: re-running overwrites whatever's in vscode/resources/.
Called by build/apply-overlay.js after the product.json deep-merge.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit(
        "[generate-icons] Pillow is required. Install with: python -m pip install Pillow"
    )


REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE = REPO_ROOT / "assets" / "finkcode-logo.png"
VSCODE_DIR = REPO_ROOT / "vscode"

# Sizes recommended by https://github.com/microsoft/vscode/wiki/Icons
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]


def log(msg: str) -> None:
    print(f"[generate-icons] {msg}")


def main() -> int:
    if not SOURCE.exists():
        sys.exit(f"[generate-icons] source missing: {SOURCE}")
    if not VSCODE_DIR.exists():
        sys.exit(
            f"[generate-icons] vscode/ missing: {VSCODE_DIR}. Run bootstrap-upstream first."
        )

    src = Image.open(SOURCE).convert("RGBA")
    log(f"loaded source {src.size[0]}x{src.size[1]} from {SOURCE.relative_to(REPO_ROOT)}")

    win32 = VSCODE_DIR / "resources" / "win32"
    darwin = VSCODE_DIR / "resources" / "darwin"
    linux = VSCODE_DIR / "resources" / "linux"

    # ── Windows: code.ico (multi-resolution) ────────────────────────
    ico_path = win32 / "code.ico"
    src.save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
    )
    log(f"wrote {ico_path.relative_to(REPO_ROOT)} ({len(ICO_SIZES)} sizes)")

    # ── Windows: tile PNGs ──────────────────────────────────────────
    for size in (70, 150):
        path = win32 / f"code_{size}x{size}.png"
        resized = resize_with_aspect(src, size)
        resized.save(path, format="PNG")
        log(f"wrote {path.relative_to(REPO_ROOT)} ({size}x{size})")

    # ── macOS: code.icns (multi-resolution) ─────────────────────────
    icns_path = darwin / "code.icns"
    icns_sources = [resize_with_aspect(src, s) for s in ICNS_SIZES]
    # Pillow's ICNS writer derives sizes from the largest image and
    # the `sizes` arg; passing the list ensures we get every variant.
    icns_sources[-1].save(
        icns_path,
        format="ICNS",
        append_images=icns_sources[:-1],
        sizes=[(s, s) for s in ICNS_SIZES],
    )
    log(f"wrote {icns_path.relative_to(REPO_ROOT)} ({len(ICNS_SIZES)} sizes)")

    # ── Linux: code.png (single 1024×1024) ──────────────────────────
    linux_path = linux / "code.png"
    resize_with_aspect(src, 1024).save(linux_path, format="PNG")
    log(f"wrote {linux_path.relative_to(REPO_ROOT)} (1024x1024)")

    # ── Linux: rpm/code.xpm (X11 pixmap, legacy) ────────────────────
    # Pillow ships a reader but no writer for XPM. Skipping leaves
    # upstream's XPM unchanged — only matters on RPM-based distros
    # using legacy X11 pixmap as the icon source. Phase 5 distribution
    # task can revisit this with `imagemagick convert` if needed.

    # ── Server / web: greeter PNGs + favicon ────────────────────────
    server = VSCODE_DIR / "resources" / "server"
    if server.exists():
        for size, name in ((192, "code-192.png"), (512, "code-512.png")):
            path = server / name
            resize_with_aspect(src, size).save(path, format="PNG")
            log(f"wrote {path.relative_to(REPO_ROOT)} ({size}x{size})")
        favicon = server / "favicon.ico"
        src.save(favicon, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
        log(f"wrote {favicon.relative_to(REPO_ROOT)} (3 sizes)")

    log("done.")
    return 0


def resize_with_aspect(img: Image.Image, size: int) -> Image.Image:
    """Resize square image with high-quality LANCZOS. Source is
    expected to already be square; if not, we pad with transparency
    after resizing the longer dimension to `size`.
    """
    w, h = img.size
    if w == h:
        return img.resize((size, size), Image.LANCZOS)
    # Non-square fallback — preserve aspect, center on transparent canvas.
    scale = size / max(w, h)
    new_w, new_h = int(round(w * scale)), int(round(h * scale))
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - new_w) // 2, (size - new_h) // 2), resized)
    return canvas


if __name__ == "__main__":
    sys.exit(main())
