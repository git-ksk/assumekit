import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ignoredDirs = new Set([".git", "dist", "node_modules"]);

function collectMarkdownFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...collectMarkdownFiles(resolve(dir, entry.name)));
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(resolve(dir, entry.name));
    }
  }

  return files;
}

function markdownOutsideFences(content) {
  const kept = [];
  let fence = null;

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(```+|~~~+)/);
    if (match) {
      const marker = match[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }

    if (fence === null) kept.push(line);
  }

  return kept.join("\n");
}

function normalizeTarget(raw) {
  let target = raw.trim();

  if (target.startsWith("<")) {
    const end = target.indexOf(">");
    if (end >= 0) target = target.slice(1, end);
  } else {
    target = target.split(/\s+["']/u, 1)[0];
  }

  if (
    target === "" ||
    target.startsWith("#") ||
    target.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/iu.test(target)
  ) {
    return null;
  }

  const pathOnly = target.split("#", 1)[0].split("?", 1)[0];
  if (!pathOnly) return null;

  try {
    return decodeURIComponent(pathOnly);
  } catch {
    return pathOnly;
  }
}

const failures = [];

for (const markdownFile of collectMarkdownFiles(repoRoot)) {
  const content = markdownOutsideFences(readFileSync(markdownFile, "utf8"));
  const targets = [];

  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
    targets.push(match[1]);
  }

  for (const match of content.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gmu)) {
    targets.push(match[1]);
  }

  for (const rawTarget of targets) {
    const target = normalizeTarget(rawTarget);
    if (target === null) continue;

    const resolved = resolve(dirname(markdownFile), target);
    if (!resolved.startsWith(`${repoRoot}/`) && resolved !== repoRoot) {
      failures.push(`${relative(repoRoot, markdownFile)} -> ${rawTarget} escapes the repository`);
      continue;
    }

    if (!existsSync(resolved)) {
      failures.push(`${relative(repoRoot, markdownFile)} -> ${rawTarget} (missing ${relative(repoRoot, resolved)})`);
      continue;
    }

    statSync(resolved);
  }
}

if (failures.length > 0) {
  console.error("Broken local Markdown links:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Local Markdown links passed.");
}
