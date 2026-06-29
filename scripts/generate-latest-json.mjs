#!/usr/bin/env node
/**
 * 从 Tauri createUpdaterArtifacts 产物生成 latest.json（供 tauri-plugin-updater 使用）。
 * 扫描 .nsis.zip / .app.tar.gz / .AppImage.tar.gz 及对应 .sig 文件。
 */
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const UPDATER_PATTERNS = [
  { test: /\.nsis\.zip$/i, os: "windows", priority: 1 },
  { test: /\.msi\.zip$/i, os: "windows", priority: 2 },
  { test: /\.app\.tar\.gz$/i, os: "darwin", priority: 1 },
  { test: /\.AppImage\.tar\.gz$/i, os: "linux", priority: 1 },
];

function parseArgs(argv) {
  const args = { bundles: "bundles", tag: "", repo: "", notes: "" };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === "--bundles") args.bundles = val;
    else if (key === "--tag") args.tag = val;
    else if (key === "--repo") args.repo = val;
    else if (key === "--notes") args.notes = val;
  }
  if (!args.tag || !args.repo) {
    console.error(
      "Usage: node scripts/generate-latest-json.mjs --bundles <dir> --tag v1.0.0 --repo owner/repo [--notes text]",
    );
    process.exit(1);
  }
  return args;
}

function parseArch(filename) {
  const lower = filename.toLowerCase();
  if (/aarch64|arm64/.test(lower)) return "aarch64";
  if (/i686|i386/.test(lower)) return "i686";
  if (/armv7/.test(lower)) return "armv7";
  return "x86_64";
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

function assetDownloadUrl(repo, tag, filename) {
  return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(filename)}`;
}

const args = parseArgs(process.argv);
const version = args.tag.replace(/^v/i, "");
const allFiles = await walk(args.bundles);

/** @type {{ path: string; name: string; os: string; arch: string; priority: number }[]} */
const candidates = [];

for (const filePath of allFiles) {
  if (filePath.endsWith(".sig")) continue;
  const name = basename(filePath);
  const pattern = UPDATER_PATTERNS.find((p) => p.test.test(name));
  if (!pattern) continue;

  const sigPath = `${filePath}.sig`;
  if (!existsSync(sigPath)) {
    console.warn(`::warning::Updater bundle missing .sig (check TAURI_SIGNING_PRIVATE_KEY): ${name}`);
    continue;
  }

  candidates.push({
    path: filePath,
    name,
    os: pattern.os,
    arch: parseArch(name),
    priority: pattern.priority,
  });
}

candidates.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

/** @type {Record<string, { signature: string; url: string }>} */
const platforms = {};

for (const item of candidates) {
  const key = `${item.os}-${item.arch}`;
  if (platforms[key]) continue;

  const signature = (await readFile(`${item.path}.sig`, "utf8")).trim();
  platforms[key] = {
    signature,
    url: assetDownloadUrl(args.repo, args.tag, item.name),
  };
}

if (Object.keys(platforms).length === 0) {
  console.error(
    "::error::No updater artifacts found. Expected *.nsis.zip, *.app.tar.gz, or *.AppImage.tar.gz with matching .sig files.",
  );
  process.exit(1);
}

const manifest = {
  version,
  notes: args.notes || `WorkHub ${args.tag}`,
  pub_date: new Date().toISOString(),
  platforms,
};

const outPath = join(args.bundles, "latest.json");
await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Generated ${outPath} with platforms: ${Object.keys(platforms).join(", ")}`);
console.log(JSON.stringify(manifest, null, 2));
