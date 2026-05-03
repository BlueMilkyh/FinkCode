# Building FinkCode (Phase 1)

FinkCode is a fork of [microsoft/vscode](https://github.com/microsoft/vscode)
pinned to tag `1.117.0`, with our branding overlay applied via
`build/apply-overlay.js` and the bundled `finkcode-core` extension
junctioned into `vscode/extensions/`.

We chose to fork microsoft/vscode directly rather than VSCodium —
fewer moving parts; we keep telemetry off via product.json overrides
and accept that we'll need to manually mirror VSCodium's
telemetry-stripping patches if the user-facing distribution requires
it (Phase 5 concern).

## Prerequisites

- **Node 22.22.1** (matches upstream `vscode/.nvmrc`)
- **Python 3** (any 3.x — for node-gyp; also for `build/generate-icons.py`)
- **Pillow** (for icon generation): `python -m pip install Pillow`
- **Platform native toolchain:**
  - Windows: **Visual Studio Build Tools 2022/2026** with "Desktop development with C++" workload **and the "MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)" individual component** — VSCode's native modules require Spectre mitigation
  - macOS: Xcode + command-line tools
  - Linux: `libxkbfile-dev`, `libsecret-1-dev`, `pkg-config`, `g++`

## Build flow

```bash
# 1. Bootstrap upstream source at the pinned tag
./build/bootstrap-upstream.sh    # clones microsoft/vscode at $VSCODE_TAG into ./vscode/

# 2. Apply our overlay (product.json deep-merge + junction extensions/finkcode-core)
./build/apply-overlay.sh         # delegates to apply-overlay.js

# 3. (Phase 2+ may add patches; Phase 1 has none.)
./build/apply-patches.sh

# 4. Install upstream dependencies — note: VSCode 1.117 uses npm, not yarn
cd vscode && npm install         # ~30-60 min on first run; compiles every native module
                                 # from source (build_from_source=true in .npmrc)

# 5. Compile the bundled extension
cd ../extensions/finkcode-core && npm install && npm run compile

# 6. Dev loop
cd ../../vscode && npm run watch                      # one terminal — long-running
./scripts/code.sh                                     # another (Windows: scripts\code.bat)
```

`scripts\code.bat` reads `nameShort` from `product.json` and runs
`.build\electron\<nameShort>.exe`. After our overlay that resolves to
`.build\electron\FinkCode.exe`.

## Environment variables you may need

```bash
# Windows: point node-gyp at Python (npm 10 dropped the python config option)
set PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe

# Use the right Node when you have multiple installed
set PATH=%LOCALAPPDATA%\Programs\node22;%PATH%
```

## Pinning the upstream version

We pin to a specific microsoft/vscode tag so upstream churn doesn't
break us. Bump it in this file's `VSCODE_TAG` constant *and* in
`build/bootstrap-upstream.sh`. Test the dev loop end-to-end before
merging the bump.

`VSCODE_TAG=1.117.0` — current pin (matches the version Aljaž has
installed, simplifies cross-version testing).

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

- [x] Phase 0: repo bootstrapped
- [x] Phase 1: VSCodium-style bootstrap & overlay scripts; pinned upstream; dev build target
- [x] Phase 2: AI side panel (`finkcode-core` chat + claude stream-json bridge + native tool use)
- [ ] Phase 3: Cmd+K + Composer + per-hunk accept/reject diff overlay
- [x] Phase 4: FinkSpace ↔ FinkCode integration on the FinkSpace side ([BlueMilkyh/FinkSpace `be722dc`](https://github.com/BlueMilkyh/FinkSpace))
- [ ] Phase 5: distribution (auto-updater, signing, installers)
