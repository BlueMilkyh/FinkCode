# `patches/`

Unified diffs against the pinned `microsoft/vscode` tag. Applied by
`build/apply-patches.sh` after `build/bootstrap-upstream.sh` clones
the upstream source.

Convention: filename is `NN-short-slug.patch`, where `NN` is a
zero-padded ordering prefix. Each patch is regenerated against the
same upstream tag pinned in `BUILD.md`.

Currently empty — Phase 1 bootstrap targets a clean upstream build.
Patches arrive as we discover branding/integration fixes that can't
be done with just `product.json` overrides.
