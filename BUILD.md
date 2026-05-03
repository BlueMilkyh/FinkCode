# Building FinkCode (Phase 1 bootstrap)

FinkCode is a fork of [VSCodium](https://github.com/VSCodium/vscodium),
which is itself a libre build of [microsoft/vscode](https://github.com/microsoft/vscode)
with telemetry/branding stripped. We build on top of VSCodium so we
can pull upstream merges without re-doing telemetry surgery.

This file is the operating manual for the Phase 1 bootstrap. The steps
below are what the next session needs to run; the repo currently
contains only the *overlay* (branding, bundled extension, CI). The
upstream source itself is not vendored — it gets cloned at build
time, exactly like VSCodium does.

## Prerequisites

- Node.js 20.x (must match upstream VSCode's `.nvmrc`)
- Yarn 1.x (Classic — VSCode's build still expects it)
- Python 3 (for `node-gyp`)
- Platform-specific:
  - **Windows:** Visual Studio 2022 with "Desktop development with C++"
  - **macOS:** Xcode + command-line tools
  - **Linux:** `libxkbfile-dev`, `libsecret-1-dev`, `pkg-config`, `g++`

## Phase 1 build flow (target state — not implemented yet)

```bash
# 1. Bootstrap upstream source at a pinned tag
./build/bootstrap-upstream.sh    # clones microsoft/vscode at tag $VSCODE_TAG into ./vscode/

# 2. Apply our overlay (product.json + bundled extensions)
./build/apply-overlay.sh         # copies product.json, links extensions/finkcode-core/

# 3. Apply patches (Phase 1: none; later phases may add)
./build/apply-patches.sh         # iterates patches/*.patch

# 4. Install dependencies
cd vscode && yarn

# 5. Compile the bundled extension
cd ../extensions/finkcode-core && yarn install && yarn compile

# 6. Dev loop
cd ../../vscode && yarn watch       # one terminal
./scripts/code.sh                   # another (Windows: scripts\code.bat)
```

## Pinning the upstream version

We pin to a specific microsoft/vscode tag so upstream churn doesn't
break us. Bump it in this file's `VSCODE_TAG` constant *and* in
`build/bootstrap-upstream.sh`. Test the dev loop end-to-end before
merging the bump.

`VSCODE_TAG=1.95.0` (placeholder — first real bootstrap will pick the
latest stable tag at that time).

## What lives in this repo

| Path | Purpose |
|------|---------|
| `product.json` | Branding overlay, applied on top of upstream |
| `extensions/finkcode-core/` | Bundled AI extension (Cmd+K, Composer, chat) |
| `patches/` | Local diffs against upstream (empty in Phase 1) |
| `build/` | Bootstrap + overlay scripts (placeholders this phase) |
| `.github/workflows/` | CI for building installers per platform |

## What does NOT live here

- The microsoft/vscode source tree. Cloned by `bootstrap-upstream.sh`
  into `./vscode/` (which is git-ignored).
- Node modules. `vscode/node_modules/` and
  `extensions/finkcode-core/node_modules/` are git-ignored.
- Compiled extension JS. `extensions/finkcode-core/out/` is git-ignored.

## Phase status

- [x] Phase 0: repo bootstrapped (this commit)
- [ ] Phase 1: write the bootstrap/overlay scripts, run a dev build, set up CI
- [ ] Phase 2: AI side panel (`finkcode-core` chat + tools)
- [ ] Phase 3: Cmd+K + Composer + inline diff
- [ ] Phase 4: FinkSpace ↔ FinkCode integration (FinkSpace side already shipped — see [BlueMilkyh/FinkSpace](https://github.com/BlueMilkyh/FinkSpace))
- [ ] Phase 5: distribution (auto-updater, signing, installers)
