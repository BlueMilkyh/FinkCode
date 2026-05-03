#!/usr/bin/env node
// apply-overlay.js — overlays our FinkCode branding onto microsoft/vscode.
//
// Phase 1 step 4: replaces upstream `product.json` fields with the
// values from our overlay (./product.json at the repo root), and
// junctions our `extensions/finkcode-core` into the upstream
// `vscode/extensions/` so it ships pre-installed.
//
// Idempotent. Safe to re-run after `bootstrap-upstream` resets the
// upstream checkout.
//
// Conventions:
//   - Strips leading-underscore keys from the overlay (those are
//     comment fields, not real product properties).
//   - Deep-merges objects (e.g. extensionsGallery).
//   - Logs every overridden field so you can see what changed.

import { readFileSync, writeFileSync, existsSync, lstatSync, readdirSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const VSCODE_DIR = process.env.VSCODE_DIR
  ? resolve(REPO_ROOT, process.env.VSCODE_DIR)
  : resolve(REPO_ROOT, "vscode");

function abort(msg) {
  console.error(`[apply-overlay] ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[apply-overlay] ${msg}`);
}

if (!existsSync(VSCODE_DIR)) {
  abort(`vscode/ not found at ${VSCODE_DIR}. Run build/bootstrap-upstream.sh first.`);
}

// ─── 1. product.json overlay ─────────────────────────────────────────

const overlayPath = join(REPO_ROOT, "product.json");
const upstreamPath = join(VSCODE_DIR, "product.json");

if (!existsSync(overlayPath)) abort(`overlay product.json missing at ${overlayPath}`);
if (!existsSync(upstreamPath)) abort(`upstream product.json missing at ${upstreamPath}`);

const overlayRaw = JSON.parse(readFileSync(overlayPath, "utf8"));
const upstream = JSON.parse(readFileSync(upstreamPath, "utf8"));

// Drop our comment fields (any key starting with "_").
const overlay = {};
for (const [k, v] of Object.entries(overlayRaw)) {
  if (k.startsWith("_")) continue;
  overlay[k] = v;
}

// Deep-merge the overlay onto the upstream. For nested objects we
// merge recursively so we don't blow away unrelated upstream fields
// (e.g. extensionsGallery's auth-related properties).
function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      target[k] &&
      typeof target[k] === "object" &&
      !Array.isArray(target[k])
    ) {
      deepMerge(target[k], v);
    } else {
      const before = JSON.stringify(target[k]);
      const after = JSON.stringify(v);
      if (before !== after) {
        log(`override ${k}: ${truncate(before)} -> ${truncate(after)}`);
      }
      target[k] = v;
    }
  }
  return target;
}

function truncate(s) {
  if (typeof s !== "string") return String(s);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

const merged = deepMerge({ ...upstream }, overlay);

writeFileSync(upstreamPath, JSON.stringify(merged, null, "\t") + "\n", "utf8");
log(`product.json: wrote ${Object.keys(merged).length} top-level fields to ${upstreamPath}`);

// ─── 2. Junction extensions/finkcode-core into vscode/extensions/ ────

const ourExt = join(REPO_ROOT, "extensions", "finkcode-core");
const targetExt = join(VSCODE_DIR, "extensions", "finkcode-core");

if (!existsSync(ourExt)) abort(`our extension missing at ${ourExt}`);

// If a previous run left a junction or copy in place, remove it first.
if (existsSync(targetExt) || lstatSyncSafe(targetExt)) {
  // Only remove if it's a junction/symlink we own; never delete a
  // directory that has user-modified content.
  const stat = lstatSyncSafe(targetExt);
  if (stat && stat.isSymbolicLink()) {
    log(`removing existing junction ${targetExt}`);
    try {
      execSync(`rmdir /Q "${targetExt}"`, { shell: "cmd.exe", stdio: "ignore" });
    } catch {
      // best-effort; leave for the user to clean up manually
    }
  } else if (stat && stat.isDirectory()) {
    log(`extensions/finkcode-core already exists as a real directory; leaving it alone`);
  }
}

if (!existsSync(targetExt)) {
  // Use a directory junction (mklink /J) — no admin required, works
  // on the same volume. Symlinks need Developer Mode or admin.
  if (process.platform === "win32") {
    execSync(
      `mklink /J "${targetExt}" "${ourExt}"`,
      { shell: "cmd.exe", stdio: "ignore" },
    );
    log(`junction: ${targetExt} -> ${ourExt}`);
  } else {
    execSync(`ln -s "${ourExt}" "${targetExt}"`, { stdio: "ignore" });
    log(`symlink: ${targetExt} -> ${ourExt}`);
  }
}

// ─── 3. Generate platform icons from assets/finkcode-logo.png ────────

const iconScript = join(REPO_ROOT, "build", "generate-icons.py");
const iconSource = join(REPO_ROOT, "assets", "finkcode-logo.png");

if (existsSync(iconSource) && existsSync(iconScript)) {
  // Resolve a Python executable. We prefer the user-scoped 3.12 install
  // from Phase 1 prep, then fall back to whatever's on PATH.
  const pythonCandidates = [
    process.env.PYTHON,
    process.platform === "win32"
      ? join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe")
      : null,
    "python3",
    "python",
  ].filter(Boolean);

  let ran = false;
  for (const py of pythonCandidates) {
    try {
      execSync(`"${py}" "${iconScript}"`, { stdio: "inherit" });
      ran = true;
      break;
    } catch {
      // try the next candidate
    }
  }
  if (!ran) {
    log(
      "WARNING: could not run generate-icons.py — icons will fall back to upstream. " +
        "Install Pillow: python -m pip install Pillow",
    );
  }
} else {
  log(
    `skipping icon generation (source: ${existsSync(iconSource)}, script: ${existsSync(iconScript)})`,
  );
}

// ─── 4. Sanity report ────────────────────────────────────────────────

log("done.");
log(`Active branding: nameLong="${merged.nameLong}" applicationName="${merged.applicationName}"`);
log(`Bundled extensions count: ${readdirSync(join(VSCODE_DIR, "extensions"), { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink()).length}`);

function lstatSyncSafe(p) {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

void mkdirSync; // keep import; unused intentionally
