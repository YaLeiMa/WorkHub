import { computed, ref, watch, type Ref } from "vue";
import { appsStore } from "./appsStore";
import { projectsStore } from "./projectsStore";
import { snippetsStore } from "./snippetsStore";
import { favoritesStore } from "./favoritesStore";
import { clipboardStore, sortClipboardEntries } from "./clipboardStore";
import { recentStore } from "./recentStore";
import { settingsStore } from "./settingsStore";
import {
  snippetListGlyph,
  snippetListSwatch,
  snippetSubtitle,
} from "./snippetDisplay";
import { requestSnippetCopy } from "./snippetCopy";
import { snippetMatchesSearch } from "./snippetSearch";
import { matchesSearch, projectMatchesSearch, sortSearchRows } from "./utils";
import { navigate } from "./nav";
import { copyText, launchApp, openFile, openProject, openUrl } from "./actions";
import { t } from "@/i18n";
import {
  SEARCH_GROUP_FAVORITES,
  SEARCH_GROUP_SNIPPETS,
  snippetCategoryLabel,
  type SearchGroupKey,
} from "./labels";
import { parseSearchQuery, type ParsedSearchQuery } from "./searchPrefix";
import { searchTools, toolDesc, toolName } from "./tools/registry";
import { openTool } from "./tools/toolHost";
import type { Favorite, ItemKind } from "./types";

function isResourceFileKind(kind: Favorite["kind"]): boolean {
  return kind === "file" || kind === "folder" || kind === "doc";
}

export type SearchGroup = SearchGroupKey;

/** 分组展示用：displayIndex 与屏幕自上而下顺序一致，供键盘 ↑↓ 使用 */
export interface GroupedSearchHit {
  row: SearchRow;
  displayIndex: number;
}

export type GroupedSearchResults = [SearchGroup, GroupedSearchHit[]][];

export interface SearchRow {
  id: string;
  kind: ItemKind;
  title: string;
  subtitle?: string;
  badge?: string;
  tags?: string[];
  updatedAt: number;
  favorite?: boolean;
  /** 色值预览，如 #409EFF */
  swatchHex?: string;
  /** 符号/Emoji 预览 */
  glyph?: string;
  recentAt?: number;
  group?: SearchGroup;
  action: () => void | boolean | Promise<void | boolean>;
  /** Ctrl+C 复制；未设置时首页/悬浮窗回退到 action */
  copy?: () => void | boolean | Promise<void | boolean>;
  navigate?: () => void;
}

const LIST_GROUP_LIMIT = 5;

function recentAt(kind: ItemKind, refId: string): number | undefined {
  return recentStore.list.find((r) => r.kind === kind && r.refId === refId)?.at;
}

function sortLimited(rows: SearchRow[], kw: string, limit?: number): SearchRow[] {
  const sorted = sortSearchRows(rows, kw);
  return limit ? sorted.slice(0, limit) : sorted;
}

function wantsGroup(group: SearchGroup, scope: SearchGroupKey | null): boolean {
  return !scope || scope === group;
}

/** 全局搜索命中（首页 / 悬浮窗共用） */
export function buildGlobalSearchHits(
  kw: string,
  scope: SearchGroupKey | null = null,
): SearchRow[] {
  const browseClipboard = scope === "clipboard" && !kw;
  const browseTools = scope === "tool" && !kw;
  if (!kw && !browseClipboard && !browseTools) return [];

  const out: SearchRow[] = [];
  const match = (s: string) => matchesSearch(s, kw);
  const projectMatches = (p: (typeof projectsStore.list)[number]) =>
    projectMatchesSearch(p, kw);
  /** 全局搜索时，命中项目名会带出该项目下全部文件/链接/命令 */
  const bundleByProjectName = !scope;

  if (wantsGroup("tool", scope)) {
    out.push(
      ...searchTools(kw).map((tool) => ({
        group: "tool" as SearchGroup,
        id: `tool-${tool.id}`,
        kind: "tool" as ItemKind,
        title: toolName(tool),
        subtitle: toolDesc(tool),
        updatedAt: 0,
        recentAt: recentAt("tool", tool.id),
        action: () => {
          openTool(tool.id);
          return true;
        },
      })),
    );
  }

  if (wantsGroup("project", scope)) {
    out.push(
      ...sortLimited(
        projectsStore.list.filter(projectMatches).map((p) => ({
          group: "project" as SearchGroup,
          id: `p-${p.id}`,
          kind: "project" as ItemKind,
          title: p.name,
          subtitle: p.group.trim() ? `${p.group} · ${p.path}` : p.path,
          tags: p.tags,
          updatedAt: p.updatedAt,
          favorite: p.favorite,
          recentAt: recentAt("project", p.id),
          action: () =>
            openProject(p.path, p.name, {
              kind: "project",
              refId: p.id,
              title: p.name,
              subtitle: p.path,
            }),
          copy: () =>
            copyText(p.path, t("toast.copied"), {
              kind: "project",
              refId: p.id,
              title: p.name,
              subtitle: p.path,
            }),
          navigate: () => navigate(`/projects/${p.id}`),
        })),
        kw,
        LIST_GROUP_LIMIT,
      ),
    );
  }

  if (wantsGroup("snippet", scope)) {
    out.push(
      ...sortLimited(
        snippetsStore.list
          .filter((s) => snippetMatchesSearch(s, match, kw))
          .map((s) => {
            const swatch = snippetListSwatch(s);
            const glyph = snippetListGlyph(s);
            return {
              group: SEARCH_GROUP_SNIPPETS as SearchGroup,
              id: `s-${s.id}`,
              kind: "snippet" as ItemKind,
              title: s.title,
              badge: snippetCategoryLabel(s.category),
              subtitle: snippetSubtitle(s),
              tags: s.tags,
              swatchHex: swatch,
              glyph,
              updatedAt: s.updatedAt,
              favorite: s.favorite,
              recentAt: recentAt("snippet", s.id),
              action: () =>
                requestSnippetCopy(s, {
                  kind: "snippet",
                  refId: s.id,
                  title: s.title,
                  subtitle: s.category,
                }),
              copy: () =>
                requestSnippetCopy(s, {
                  kind: "snippet",
                  refId: s.id,
                  title: s.title,
                  subtitle: s.category,
                }),
              navigate: () => navigate(`/snippets/${s.id}`),
            };
          }),
        kw,
        LIST_GROUP_LIMIT,
      ),
    );
  }

  if (wantsGroup("favorite", scope)) {
    out.push(
      ...sortLimited(
        favoritesStore.list
          .filter(
            (f) =>
              f.kind === "link" &&
              (match(f.title) || match(f.target) || f.tags.some(match)),
          )
          .map((f) => ({
            group: SEARCH_GROUP_FAVORITES as SearchGroup,
            id: `f-${f.id}`,
            kind: f.kind,
            title: f.title,
            subtitle: f.target,
            tags: f.tags,
            updatedAt: f.updatedAt,
            recentAt: recentAt(f.kind, f.id),
            action: () =>
              openUrl(f.target, {
                kind: f.kind,
                refId: f.id,
                title: f.title,
                subtitle: f.target,
              }),
            copy: () =>
              copyText(f.target, t("toast.copied"), {
                kind: f.kind,
                refId: f.id,
                title: f.title,
                subtitle: f.target,
              }),
          })),
        kw,
        LIST_GROUP_LIMIT,
      ),
    );
  }

  if (wantsGroup("file", scope)) {
    const fileHits: SearchRow[] = [];
    projectsStore.list.forEach((p) => {
      p.docs
        .filter(
          (d) =>
            match(d.title) ||
            match(d.path) ||
            (bundleByProjectName && projectMatches(p)),
        )
        .forEach((d) =>
          fileHits.push({
            group: "file",
            id: `doc-${p.id}-${d.id}`,
            kind: "doc",
            title: d.title,
            subtitle: `${p.name} · ${d.path}`,
            tags: [p.name],
            updatedAt: p.updatedAt,
            action: () =>
              openFile(d.path, t("toast.opened"), {
                kind: "doc",
                refId: d.id,
                title: d.title,
                subtitle: d.path,
              }),
            copy: () =>
              copyText(d.path, t("toast.copied"), {
                kind: "doc",
                refId: d.id,
                title: d.title,
                subtitle: d.path,
              }),
            navigate: () => navigate(`/projects/${p.id}`),
          }),
        );
    });
    favoritesStore.list
      .filter(
        (f) =>
          isResourceFileKind(f.kind) &&
          (match(f.title) || match(f.target) || f.tags.some(match)),
      )
      .forEach((f) =>
        fileHits.push({
          group: "file",
          id: `f-${f.id}`,
          kind: f.kind,
          title: f.title,
          subtitle: f.target,
          tags: f.tags,
          updatedAt: f.updatedAt,
          recentAt: recentAt(f.kind, f.id),
          action: () =>
            openFile(f.target, t("toast.opened"), {
              kind: f.kind,
              refId: f.id,
              title: f.title,
              subtitle: f.target,
            }),
          copy: () =>
            copyText(f.target, t("toast.copied"), {
              kind: f.kind,
              refId: f.id,
              title: f.title,
              subtitle: f.target,
            }),
          navigate: () => navigate("/favorites"),
        }),
      );
    out.push(...sortLimited(fileHits, kw));
  }

  if (wantsGroup("link", scope)) {
    const linkHits: SearchRow[] = [];
    projectsStore.list.forEach((p) => {
      p.links
        .filter(
          (l) =>
            match(l.title) ||
            match(l.url) ||
            (bundleByProjectName && projectMatches(p)),
        )
        .forEach((l) =>
          linkHits.push({
            group: "link",
            id: `lnk-${p.id}-${l.id}`,
            kind: "link",
            title: l.title,
            subtitle: `${p.name} · ${l.url}`,
            tags: [p.name],
            updatedAt: p.updatedAt,
            action: () =>
              openUrl(l.url, {
                kind: "link",
                refId: l.id,
                title: l.title,
                subtitle: l.url,
              }),
            copy: () =>
              copyText(l.url, t("toast.copied"), {
                kind: "link",
                refId: l.id,
                title: l.title,
                subtitle: l.url,
              }),
            navigate: () => navigate(`/projects/${p.id}`),
          }),
        );
    });
    favoritesStore.list
      .filter(
        (f) =>
          f.kind === "link" &&
          (match(f.title) || match(f.target) || f.tags.some(match)),
      )
      .forEach((f) =>
        linkHits.push({
          group: "link",
          id: `fav-${f.id}`,
          kind: "link",
          title: f.title,
          subtitle: f.target,
          tags: f.tags,
          updatedAt: f.updatedAt,
          action: () =>
            openUrl(f.target, {
              kind: f.kind,
              refId: f.id,
              title: f.title,
              subtitle: f.target,
            }),
          copy: () =>
            copyText(f.target, t("toast.copied"), {
              kind: f.kind,
              refId: f.id,
              title: f.title,
              subtitle: f.target,
            }),
        }),
      );
    out.push(...sortLimited(linkHits, kw));
  }

  if (wantsGroup("command", scope)) {
    const commandHits: SearchRow[] = [];
    projectsStore.list.forEach((p) => {
      p.commands
        .filter(
          (c) =>
            match(c.title) ||
            match(c.command) ||
            (bundleByProjectName && projectMatches(p)),
        )
        .forEach((c) =>
          commandHits.push({
            group: "command",
            id: `cmd-${p.id}-${c.id}`,
            kind: "command",
            title: c.title,
            subtitle: c.command,
            tags: [p.name],
            updatedAt: p.updatedAt,
            action: () =>
              copyText(c.command, t("toast.commandCopied"), {
                kind: "command",
                refId: c.id,
                title: c.title,
                subtitle: c.command,
              }),
            copy: () =>
              copyText(c.command, t("toast.commandCopied"), {
                kind: "command",
                refId: c.id,
                title: c.title,
                subtitle: c.command,
              }),
            navigate: () => navigate(`/projects/${p.id}`),
          }),
        );
    });
    out.push(...sortLimited(commandHits, kw));
  }

  if (wantsGroup("app", scope)) {
    out.push(
      ...sortLimited(
        appsStore.list
          .filter(
            (a) =>
              match(a.title) || match(a.target) || a.tags.some(match),
          )
          .map((a) => ({
            group: "app" as SearchGroup,
            id: `app-${a.id}`,
            kind: "app" as ItemKind,
            title: a.title,
            subtitle: a.target,
            tags: a.tags,
            updatedAt: a.updatedAt,
            recentAt: recentAt("app", a.id),
            action: () =>
              launchApp(a.target, a.title, {
                kind: "app",
                refId: a.id,
                title: a.title,
                subtitle: a.target,
              }),
            navigate: () => navigate("/apps"),
          })),
        kw,
        LIST_GROUP_LIMIT,
      ),
    );
  }

  if (wantsGroup("clipboard", scope) && settingsStore.clipboardHistoryEnabled) {
    const clipKw =
      browseClipboard ||
      kw === "clip" ||
      kw === "clipboard" ||
      kw === "剪贴板"
        ? ""
        : kw;
    const clipHits = sortClipboardEntries(
      clipboardStore.list.filter(
        (c) =>
          !clipKw ||
          match(c.preview) ||
          match(c.content) ||
          kw === "clip" ||
          kw === "clipboard" ||
          kw === "剪贴板",
      ),
    )
      .slice(0, scope === "clipboard" ? 20 : LIST_GROUP_LIMIT)
      .map((c) => ({
        group: "clipboard" as SearchGroup,
        id: `cb-${c.id}`,
        kind: "clipboard" as ItemKind,
        title: c.preview || t("clipboard.clipboardText"),
        badge: c.pinned ? t("clipboard.stackBadge") : undefined,
        subtitle:
          c.content.length > 80 ? `${c.content.slice(0, 80)}…` : c.content,
        updatedAt: c.createdAt,
        action: () =>
          copyText(c.content, t("toast.clipboardCopied"), {
            kind: "clipboard",
            refId: c.id,
            title: c.preview,
          }),
        copy: () =>
          copyText(c.content, t("toast.clipboardCopied"), {
            kind: "clipboard",
            refId: c.id,
            title: c.preview,
          }),
      }));
    out.push(...clipHits);
  }

  return sortSearchRows(out, kw, {
    clipboardLast: scope !== "clipboard",
  });
}

/** 首页 / 悬浮窗共用的全局搜索逻辑 */
export function useGlobalSearch(externalQ?: Ref<string>) {
  const q = externalQ ?? ref("");
  const parsed = ref<ParsedSearchQuery>(parseSearchQuery(""));
  const sel = ref(0);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  watch(q, (val) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      parsed.value = parseSearchQuery(val);
    }, 100);
  });

  /** 关键词（不含前缀，供高亮） */
  const searchQuery = computed(() => parsed.value.query);
  /** 前缀限定分组 */
  const searchScope = computed(() => parsed.value.scope);
  /** 兼容旧名 */
  const debounced = searchQuery;

  const hits = computed(() =>
    buildGlobalSearchHits(parsed.value.query, parsed.value.scope),
  );

  const grouped = computed<GroupedSearchResults>(() => {
    if (!parsed.value.hasInput) return [];
    if (!parsed.value.query && hits.value.length === 0) return [];
    const map = new Map<SearchGroup, SearchRow[]>();
    for (const h of hits.value) {
      const g = h.group!;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(h);
    }
    const entries: GroupedSearchResults = [];
    let displayIndex = 0;
    for (const [group, rows] of map) {
      entries.push([
        group,
        rows.map((row) => ({ row, displayIndex: displayIndex++ })),
      ]);
    }
    return entries;
  });

  /** 与分组 UI 自上而下顺序一致的扁平列表（键盘导航用） */
  const displayHits = computed(() =>
    grouped.value.flatMap(([, items]) => items.map((item) => item.row)),
  );

  const hasSearchInput = computed(() => parsed.value.hasInput);

  watch(parsed, () => {
    sel.value = 0;
  });

  watch(
    () => displayHits.value.length,
    (len) => {
      if (sel.value >= len) sel.value = Math.max(0, len - 1);
    },
  );

  return {
    q,
    parsed,
    debounced,
    searchQuery,
    searchScope,
    hasSearchInput,
    sel,
    hits,
    grouped,
    displayHits,
  };
}
