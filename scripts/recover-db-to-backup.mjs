/**
 * 从损坏/旧版 workhub.db 导出可导入的 JSON 备份（应用打不开时使用）
 *
 * 用法：
 *   npm run recover-db
 *   npm run recover-db -- "C:\Users\你\AppData\Roaming\com.workhub.app\workhub.db.bak"
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import initSqlJs from "sql.js";

const DEFAULT_DB = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "com.workhub.app",
  "workhub.db",
);

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function rowToProject(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    path: r.path ?? "",
    gitUrl: r.git_url ?? "",
    group: r.group_name ?? "",
    sortOrder: Number(r.sort_order ?? 0),
    tags: parseJsonArray(r.tags),
    favorite: !!r.is_favorite,
    updatedAt: Number(r.updated_at ?? Date.now()),
    links: parseJsonArray(r.links),
    commands: parseJsonArray(r.commands),
    docs: parseJsonArray(r.docs),
  };
}

function rowToSnippet(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    category: r.category,
    language: r.language ?? "",
    tags: parseJsonArray(r.tags),
    code: r.code ?? "",
    favorite: !!r.is_favorite,
    updatedAt: Number(r.updated_at ?? Date.now()),
  };
}

function rowToFavorite(r) {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    target: r.target,
    color: r.color ?? "",
    tags: parseJsonArray(r.tags),
    updatedAt: Number(r.updated_at ?? r.created_at ?? Date.now()),
  };
}

function rowToApp(r) {
  return {
    id: r.id,
    title: r.title,
    target: r.target ?? "",
    sortOrder: Number(r.sort_order ?? 0),
    tags: parseJsonArray(r.tags),
    updatedAt: Number(r.updated_at ?? Date.now()),
  };
}

function rowToWorkflow(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    projectId: r.project_id || undefined,
    tags: parseJsonArray(r.tags),
    favorite: !!r.is_favorite,
    hotkey: r.hotkey || undefined,
    steps: parseJsonArray(r.steps),
    updatedAt: Number(r.updated_at ?? Date.now()),
  };
}

function queryAll(db, sql) {
  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function readMeta(db, key) {
  const rows = queryAll(
    db,
    `SELECT value FROM app_meta WHERE key = ${JSON.stringify(key)} LIMIT 1`,
  );
  return rows[0]?.value;
}

function tableExists(db, name) {
  const rows = queryAll(
    db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name=${JSON.stringify(name)}`,
  );
  return rows.length > 0;
}

function safeTable(db, name, mapper) {
  if (!tableExists(db, name)) return [];
  return queryAll(db, `SELECT * FROM ${name}`).map(mapper);
}

async function main() {
  const dbPath = process.argv[2] || DEFAULT_DB;
  const resolved = path.resolve(dbPath);

  if (!fs.existsSync(resolved)) {
    console.error(`找不到数据库文件：\n  ${resolved}`);
    console.error("\n请指定路径，例如：");
    console.error('  npm run recover-db -- "%APPDATA%\\com.workhub.app\\workhub.db.bak"');
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(resolved);
  const db = new SQL.Database(fileBuffer);

  let projectGroupOrder = [];
  let projectGroupChildOrder = {};
  try {
    projectGroupOrder = JSON.parse(readMeta(db, "project_group_order") || "[]");
  } catch {
    /* ignore */
  }
  try {
    projectGroupChildOrder = JSON.parse(
      readMeta(db, "project_group_child_order") || "{}",
    );
  } catch {
    /* ignore */
  }

  const payload = {
    format: "workhub-backup",
    version: 3,
    exportedAt: Date.now(),
    projects: safeTable(db, "projects", rowToProject),
    snippets: safeTable(db, "snippets", rowToSnippet),
    favorites: safeTable(db, "favorites", rowToFavorite),
    apps: safeTable(db, "launcher_apps", rowToApp),
    workflows: safeTable(db, "workflows", rowToWorkflow),
    projectGroupOrder: Array.isArray(projectGroupOrder) ? projectGroupOrder : [],
    projectGroupChildOrder:
      projectGroupChildOrder && typeof projectGroupChildOrder === "object"
        ? projectGroupChildOrder
        : {},
  };

  const stamp = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const name = `workhub-recovered-${stamp.getFullYear()}${p(stamp.getMonth() + 1)}${p(stamp.getDate())}-${p(stamp.getHours())}${p(stamp.getMinutes())}.json`;
  const outPath = path.join(path.dirname(resolved), name);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

  console.log("已从数据库导出备份：");
  console.log(`  ${outPath}`);
  console.log(
    `\n项目 ${payload.projects.length} · 片段 ${payload.snippets.length} · 资源 ${payload.favorites.length} · 应用 ${payload.apps.length} · 工作流 ${payload.workflows.length}`,
  );
  console.log("\n下一步：");
  console.log("  1. 让 WorkHub 能启动（见文档或删除损坏的 workhub.db）");
  console.log("  2. 设置 → 导入数据 → 选择上面的 JSON 文件");

  db.close();
}

main().catch((e) => {
  console.error("导出失败：", e.message || e);
  process.exit(1);
});
