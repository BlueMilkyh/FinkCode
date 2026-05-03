# FinkCode

Cursor-style AI code editor — fork of [VSCodium](https://github.com/VSCodium/vscodium) with a built-in `finkcode-core` extension that adds an AI side panel, `Cmd+K` inline edits, a multi-file Composer, and per-hunk accept/reject diff overlays.

Sibling product to [FinkSpace](https://github.com/BlueMilkyh/FinkSpace) (terminal workspace manager) — the two apps share a settings directory at `~/.fink/` and a launch protocol so any FinkSpace workspace can be opened in FinkCode and back.

## Status

Phase 1 — repo bootstrap. VSCodium fork, branding, and CI scaffolding land first; the AI extension follows.

## Roadmap

| Phase | Deliverable |
|-------|-------------|
| 1 | Fork & brand — `product.json` rebrand, `yarn watch` dev loop, GitHub Actions builds for Windows/macOS/Linux |
| 2 | `finkcode-core` extension — hidden `claude` CLI bridge, AI side panel, file/git tools |
| 3 | Cmd+K inline edit, Composer multi-file run, inline per-hunk accept/reject diff overlay |
| 4 | FinkSpace integration — `Open in FinkCode` from terminal workspaces, shared `~/.fink/` settings |
| 5 | Distribution — auto-updater, signing, installers |

## Build (placeholder)

```bash
yarn
yarn watch
./scripts/code.sh        # macOS / Linux
scripts\code.bat         # Windows
```

These commands will work once the VSCodium bootstrap lands in Phase 1.

## License

TBD — see open question in the master plan.
