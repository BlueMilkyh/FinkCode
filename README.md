# FinkCode

Cursor-style AI code editor — fork of [VSCodium](https://github.com/VSCodium/vscodium)
with a built-in `finkcode-core` extension that adds an AI side panel,
`Cmd+K` inline edits, a multi-file Composer, and per-hunk accept/reject
diff overlays.

Sibling product to [FinkSpace](https://github.com/BlueMilkyh/FinkSpace)
(terminal workspace manager) — the two apps share a settings directory
at `~/.fink/` and a launch protocol so any FinkSpace workspace can be
opened in FinkCode and back. FinkSpace already ships the
"Open in FinkCode" launcher (Home tile, agent header button, Settings
→ CLI binary path); the IDE itself comes online with Phase 2.

## Status

Phase 0 (this commit): repo scaffolded — branding overlay, bundled
extension skeleton, CI placeholder, build scripts as stubs. See
[`BUILD.md`](./BUILD.md) for the bootstrap plan.

Phase 1 (next session): clone microsoft/vscode at the pinned tag,
apply our overlay, get `yarn watch` running, wire CI to produce
artifacts on tag push.

## Roadmap

| Phase | Deliverable |
|-------|-------------|
| 0 | **Done** — repo scaffold |
| 1 | Fork & brand — `product.json` rebrand, `yarn watch` dev loop, CI builds for Windows/macOS/Linux |
| 2 | `finkcode-core` extension — hidden `claude` CLI bridge, AI side panel, file/git tools |
| 3 | Cmd+K inline edit, Composer multi-file run, inline per-hunk accept/reject diff overlay |
| 4 | FinkSpace integration — already shipped on the FinkSpace side ([commit `be722dc`](https://github.com/BlueMilkyh/FinkSpace/commit/be722dc)); FinkCode side is a no-op until Phase 1 ships a binary |
| 5 | Distribution — auto-updater, signing, installers |

## Repo layout

```
FinkCode/
├── product.json                       # Branding overlay applied on top of microsoft/vscode
├── BUILD.md                           # Bootstrap plan (this is the operating manual)
├── extensions/finkcode-core/          # Bundled AI extension (Phase 2 onwards)
│   ├── package.json                   # Commands + keybindings + view contributions
│   ├── tsconfig.json
│   └── src/
│       ├── extension.ts               # Entry — registers stubs today, wires real features in Phase 2
│       ├── bridge/                    # Phase 2 — hidden claude PTY (port of finkbridge/manager.ts)
│       ├── tools/                     # Phase 2 — read_file / edit_file / apply_patch / git_*
│       ├── panel/                     # Phase 2 chat + Phase 3 composer webviews
│       ├── cmdk/                      # Phase 3 — Cmd+K inline edit
│       ├── composer/                  # Phase 3 — multi-file plan + per-file approval
│       └── diff/                      # Phase 3 — pending-edit store + decorations
├── patches/                           # Local diffs against the pinned upstream tag
├── build/                             # Bootstrap + overlay scripts (placeholders today)
└── .github/workflows/                 # CI matrix for win/mac/linux
```

The microsoft/vscode source itself is **not** vendored here. Phase 1
clones it at the pinned tag into a git-ignored `./vscode/` directory,
applies our overlay + patches, and builds.

## Build (after Phase 1 ships)

```bash
./build/bootstrap-upstream.sh    # clones microsoft/vscode at the pinned tag
./build/apply-overlay.sh         # writes product.json + links extensions
./build/apply-patches.sh         # iterates patches/

cd vscode && yarn
yarn watch                       # one terminal
./scripts/code.sh                # another (Windows: scripts\code.bat)
```

Today these scripts print "not yet implemented" and exit 0 — they
exist so callers (CI, contributors) know the interface. See
[`BUILD.md`](./BUILD.md) for prerequisites and the full flow.

## License

TBD — see the master plan's open questions. The bundled extension is
already MIT-stamped in `extensions/finkcode-core/package.json`; the
top-level license decision affects how we mark the overall fork.
