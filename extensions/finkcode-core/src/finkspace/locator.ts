// Locator for the FinkSpace launcher binary.
//
// Mirrors src-tauri/src/commands/finkcode.rs in the FinkSpace repo —
// settings override → PATH lookup → well-known install paths. Used
// by the openInFinkSpace command and the status-bar item to enable
// quick switching between FinkCode and FinkSpace.

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface FinkSpaceLocation {
  /** Absolute path to the launcher; null when not found. */
  binary: string | null;
  /** Where the resolution came from (for diagnostics). */
  source: "settings" | "path" | "well-known" | "not-found";
}

const PROBE_NAMES = process.platform === "win32"
  ? ["finkspace.exe", "finkspace.cmd", "finkspace.bat", "finkspace"]
  : ["finkspace"];

/**
 * Resolve the FinkSpace launcher. Cheap, synchronous — the result is
 * cached by callers; re-run on demand (Refresh button, settings change).
 */
export function locateFinkSpace(overridePath?: string): FinkSpaceLocation {
  const trimmed = (overridePath ?? "").trim();
  if (trimmed && fs.existsSync(trimmed) && fs.statSync(trimmed).isFile()) {
    return { binary: trimmed, source: "settings" };
  }

  const pathFound = findOnPath();
  if (pathFound) return { binary: pathFound, source: "path" };

  const wellKnown = findWellKnown();
  if (wellKnown) return { binary: wellKnown, source: "well-known" };

  return { binary: null, source: "not-found" };
}

function findOnPath(): string | null {
  const PATH = process.env.PATH || "";
  const sep = process.platform === "win32" ? ";" : ":";
  for (const dir of PATH.split(sep)) {
    if (!dir) continue;
    for (const name of PROBE_NAMES) {
      const candidate = path.join(dir, name);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // skip unreadable entries
      }
    }
  }
  return null;
}

function findWellKnown(): string | null {
  const candidates: string[] = [];

  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    if (local) {
      candidates.push(path.join(local, "FinkSpace", "bin", "finkspace.exe"));
      candidates.push(path.join(local, "Programs", "FinkSpace", "FinkSpace.exe"));
    }
    const programFiles = process.env["ProgramFiles"];
    if (programFiles) {
      candidates.push(path.join(programFiles, "FinkSpace", "FinkSpace.exe"));
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/FinkSpace.app/Contents/MacOS/FinkSpace");
    candidates.push(
      path.join(os.homedir(), "Applications/FinkSpace.app/Contents/MacOS/FinkSpace"),
    );
    candidates.push("/usr/local/bin/finkspace");
  } else {
    candidates.push("/usr/bin/finkspace");
    candidates.push("/usr/local/bin/finkspace");
    candidates.push(path.join(os.homedir(), ".local/bin/finkspace"));
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      // skip
    }
  }
  return null;
}

/**
 * Spawn FinkSpace at the given workdir as a detached process. Throws
 * a friendly error if the launcher is missing — caller is expected to
 * surface that as an information message + a "Configure path…" button.
 */
export function spawnFinkSpace(args: {
  workDir: string | null;
  overridePath?: string;
  /** Extra args appended after the workdir. Reserved for --view <name> when FinkSpace gains the flag. */
  extra?: string[];
}): void {
  const loc = locateFinkSpace(args.overridePath);
  if (!loc.binary) {
    throw new Error(
      "FinkSpace is not installed (or not on PATH). " +
        "Install the FinkSpace launcher via FinkSpace → Settings → CLI, " +
        "or set finkcode.finkSpaceBinaryPath in settings.",
    );
  }

  const cliArgs: string[] = [];
  if (args.workDir) cliArgs.push(args.workDir);
  if (args.extra && args.extra.length) cliArgs.push(...args.extra);

  cp.spawn(loc.binary, cliArgs, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref();
}
