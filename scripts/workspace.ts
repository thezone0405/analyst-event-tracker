/**
 * Shell + git working-tree helpers for the agent harness (scripts/harness.ts).
 *
 * Working-tree tracking attributes file changes to the agent/stage that made
 * them, so commits contain only that work and out-of-scope edits can be undone.
 * Paths are repo-relative with forward slashes, as git prints them, and the
 * process is expected to run from the repository root. Git-ignored files
 * (reports/, coverage/, dist/, node_modules/) are never tracked.
 */
import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCommand(command: string, input?: string): CommandResult {
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  try {
    const stdout = execSync(command, {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
      env: cleanEnv,
      maxBuffer: 64 * 1024 * 1024,
    });

    return { code: 0, stdout, stderr: "" };
  } catch (error: unknown) {
    const err = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      code: err.status ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
    };
  }
}

interface FileState {
  /** sha256 of the content on disk, or null when the file does not exist. */
  hash: string | null;
  content: Buffer | null;
}

/** State of every path that differed from HEAD when the snapshot was taken. */
export type WorkspaceSnapshot = Map<string, FileState>;

function readFileState(filePath: string): FileState {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return { hash: null, content: null };
  }
  const content = fs.readFileSync(filePath);
  return {
    hash: crypto.createHash("sha256").update(content).digest("hex"),
    content,
  };
}

/** Paths with uncommitted changes (modified, staged, deleted or untracked). */
export function listDirtyPaths(): string[] {
  const { stdout } = runCommand(
    "git status --porcelain=v1 -z --untracked-files=all",
  );
  const tokens = stdout.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i].slice(0, 2);
    paths.push(tokens[i].slice(3));
    // Renames/copies are followed by their original path as a separate token.
    if (status[0] === "R" || status[0] === "C") paths.push(tokens[++i]);
  }
  return paths;
}

export function snapshotWorkspace(): WorkspaceSnapshot {
  return new Map(listDirtyPaths().map((p) => [p, readFileState(p)]));
}

/** Paths whose content changed since `before` was taken. */
export function changedSince(before: WorkspaceSnapshot): string[] {
  const changed = new Set<string>();
  for (const p of listDirtyPaths()) {
    if (!before.has(p)) changed.add(p); // was identical to HEAD, now differs
  }
  for (const [p, state] of before) {
    if (readFileState(p).hash !== state.hash) changed.add(p);
  }
  return [...changed].sort();
}

/** Puts `paths` back exactly as they were when `before` was taken. */
export function restorePaths(paths: string[], before: WorkspaceSnapshot): void {
  for (const p of paths) {
    const saved = before.get(p);
    if (saved) {
      if (saved.content === null) fs.rmSync(p, { force: true });
      else fs.writeFileSync(p, saved.content);
    } else if (runCommand(`git cat-file -e "HEAD:${p}"`).code === 0) {
      runCommand(`git checkout HEAD -- "${p}"`);
    } else {
      fs.rmSync(p, { force: true });
    }
  }
}

export function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      pattern += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (char === "*") {
      pattern += "[^/]*";
    } else {
      pattern += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function isInScope(filePath: string, scope: readonly string[]): boolean {
  return scope.some((glob) => globToRegExp(glob).test(filePath));
}

/**
 * Commits exactly `paths` (including deletions), leaving any other staged or
 * unstaged changes in the working tree untouched.
 */
export function commitPaths(paths: string[], message: string): void {
  if (paths.length === 0) {
    console.log(`ℹ️ Nothing to commit for "${message}".`);
    return;
  }
  const list = `${paths.join("\n")}\n`;
  runCommand("git --literal-pathspecs add -A --pathspec-from-file=-", list);
  const res = runCommand(
    `git --literal-pathspecs commit -m "${message}" --only --pathspec-from-file=-`,
    list,
  );
  if (res.code === 0) {
    console.log(`✓ Committed ${paths.length} file(s): ${message}`);
  } else {
    console.warn(`⚠️ Commit failed for "${message}":\n${res.stderr || res.stdout}`);
  }
}
