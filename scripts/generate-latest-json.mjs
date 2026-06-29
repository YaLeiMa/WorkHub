#!/usr/bin/env node
/**
 * 从 Tauri createUpdaterArtifacts 产物生成 latest.json（供 tauri-plugin-updater 使用）。
 *
 * Tauri v2（createUpdaterArtifacts: true）：
 *   Windows → *-setup.exe + .sig
 *   macOS   → *.app.tar.gz + .sig
 *   Linux   → *.AppImage + .sig
 *
 * v1Compatible 另支持 *.nsis.zip / *.AppImage.tar.gz 等。
 */
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

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

/** @returns {{ os: string; priority: number } | null} */
function classifyUpdaterBundle(name) {
  if (/\.app\.tar\.gz$/i.test(name)) return { os: "darwin", priority: 100 };
  if (/\.AppImage\.tar\.gz$/i.test(name)) return { os: "linux", priority: 50 };
  if (/\.AppImage$/i.test(name)) return { os: "linux", priority: 100 };
  if (/\.nsis\.zip$/i.test(name)) return { os: "windows", priority: 50 };
  if (/-setup\.exe$/i.test(name)) return { os: "windows", priority: 99 };
  if (/\.msi\.zip$/i.test(name)) return { os: "windows", priority: 48 };
  if (/\.msi$/i.test(name)) return { os: "windows", priority: 40 };
  return null;
}

function parseArch(filename) {
  const lower = filename.toLowerCase();
  if (/aarch64|arm64|universal/.test(lower)) return "aarch64";
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

/** @type {{ sigPath: string; bundlePath: string; name: string; os: string; arch: string; priority: number }[]} */
const candidates = [];

const sigPaths = allFiles.filter((f) => f.endsWith(".sig"));
const unrecognizedSigs = [];

for (const sigPath of sigPaths) {
  const bundlePath = sigPath.slice(0, -".sig".length);
  if (!existsSync(bundlePath)) {
    console.warn(`::warning::Orphan .sig (bundle missing): ${basename(sigPath)}`);
    continue;
  }

  const name = basename(bundlePath);
  const kind = classifyUpdaterBundle(name);
  if (!kind) {
    unrecognizedSigs.push(basename(sigPath));
    continue;
  }

  candidates.push({
    sigPath,
    bundlePath,
    name,
    os: kind.os,
    arch: parseArch(name),
    priority: kind.priority,
  });
}

candidates.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

/** @type {Record<string, { signature: string; url: string }>} */
const platforms = {};

for (const item of candidates) {
  const key = `${item.os}-${item.arch}`;
  if (platforms[key]) continue;

  const signature = (await readFile(item.sigPath, "utf8")).trim();
  platforms[key] = {
    signature,
    url: assetDownloadUrl(args.repo, args.tag, item.name),
  };
}

if (Object.keys(platforms).length === 0) {
  const sigFiles = allFiles.filter((f) => f.endsWith(".sig")).map(basename);
  console.error("::error::No updater artifacts found.");
  console.error("Expected Tauri v2: *-setup.exe.sig, *.app.tar.gz.sig, *.AppImage.sig");
  console.error("Or v1Compatible: *.nsis.zip.sig, *.AppImage.tar.gz.sig");
  console.error("Ensure TAURI_SIGNING_PRIVATE_KEY is set in GitHub Secrets.");
  if (sigFiles.length > 0) {
    console.error(`Found .sig files (${sigFiles.length}): ${sigFiles.join(", ")}`);
  } else {
    console.error("No .sig files found in bundles — signing likely did not run.");
    console.error("Sample files:");
    for (const f of allFiles.slice(0, 30)) console.error(`  ${f}`);
  }
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

const expected = ["darwin-aarch64", "windows-x86_64", "linux-x86_64"];
const missing = expected.filter((k) => !platforms[k]);
if (missing.length > 0) {
  console.warn(`::warning::latest.json missing platforms: ${missing.join(", ")}`);
  const hasDmg = allFiles.some((f) => /\.dmg$/i.test(f));
  const hasAppTarGz = allFiles.some((f) => /\.app\.tar\.gz$/i.test(f));
  const hasAppTarGzSig = sigPaths.some((f) => /\.app\.tar\.gz\.sig$/i.test(f));
  if (hasDmg && !hasAppTarGzSig) {
    console.warn(
      "::warning::macOS .dmg found but no WorkHub.app.tar.gz.sig — mac CI job may have failed, or TAURI_SIGNING_PRIVATE_KEY was missing on macOS build.",
    );
  }
  if (hasAppTarGz && !hasAppTarGzSig) {
    console.warn(
      "::warning::WorkHub.app.tar.gz exists without .sig — re-run macOS build with TAURI_SIGNING_PRIVATE_KEY set.",
    );
  }
}
if (unrecognizedSigs.length > 0) {
  console.warn(`::warning::Unrecognized .sig (skipped): ${unrecognizedSigs.join(", ")}`);
}

console.log(`Generated ${outPath} with platforms: ${Object.keys(platforms).join(", ")}`);
console.log(JSON.stringify(manifest, null, 2));
