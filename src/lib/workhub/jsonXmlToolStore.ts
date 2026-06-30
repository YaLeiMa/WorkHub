import { reactive } from "vue";
import { DEFAULT_UNWRAP_FIELDS } from "@/lib/workhub/tools/jsonXml";
import { getDb, inTauri } from "./db";
import { getMeta, setMeta } from "./meta";

const STORAGE_KEY = "tool_json_xml_v1";
const META_KEY = "tool_json_xml_v1";

export type JsonXmlMode = "j2x" | "x2j";
export type JsonXmlIndent = "2" | "4" | "tab";

export interface JsonXmlToolPrefs {
  mode: JsonXmlMode;
  indent: JsonXmlIndent;
  keepAttributes: boolean;
  xmlDeclaration: boolean;
  stripNsPrefix: boolean;
  unwrapEnabled: boolean;
  unwrapFields: string[];
  parseEmbeddedXml: boolean;
}

export interface JsonXmlPreset {
  id: string;
  name: string;
  prefs: JsonXmlToolPrefs;
}

interface JsonXmlPersisted {
  activePresetId: string;
  last: JsonXmlToolPrefs;
  presets: JsonXmlPreset[];
}

export function defaultJsonXmlToolPrefs(): JsonXmlToolPrefs {
  return {
    mode: "x2j",
    indent: "2",
    keepAttributes: false,
    xmlDeclaration: false,
    stripNsPrefix: true,
    unwrapEnabled: true,
    unwrapFields: [...DEFAULT_UNWRAP_FIELDS],
    parseEmbeddedXml: true,
  };
}

export const jsonXmlToolStore = reactive({
  loaded: false,
  activePresetId: "",
  last: defaultJsonXmlToolPrefs(),
  presets: [] as JsonXmlPreset[],
});

let loading: Promise<void> | null = null;

function normalizePrefs(raw: Partial<JsonXmlToolPrefs> | undefined): JsonXmlToolPrefs {
  const base = defaultJsonXmlToolPrefs();
  if (!raw) return base;
  const indent = raw.indent;
  return {
    mode: raw.mode === "j2x" ? "j2x" : "x2j",
    indent: indent === "4" || indent === "tab" ? indent : "2",
    keepAttributes: !!raw.keepAttributes,
    xmlDeclaration: !!raw.xmlDeclaration,
    stripNsPrefix: raw.stripNsPrefix !== false,
    unwrapEnabled: raw.unwrapEnabled !== false,
    unwrapFields: Array.isArray(raw.unwrapFields)
      ? raw.unwrapFields.map(String).filter(Boolean)
      : [...DEFAULT_UNWRAP_FIELDS],
    parseEmbeddedXml: raw.parseEmbeddedXml !== false,
  };
}

function normalizePersisted(raw: unknown): JsonXmlPersisted {
  const data = (raw && typeof raw === "object" ? raw : {}) as Partial<JsonXmlPersisted>;
  return {
    activePresetId: typeof data.activePresetId === "string" ? data.activePresetId : "",
    last: normalizePrefs(data.last),
    presets: Array.isArray(data.presets)
      ? data.presets
          .filter((p) => p && typeof p === "object" && typeof p.id === "string")
          .map((p) => ({
            id: p.id,
            name: String(p.name || "").trim() || p.id,
            prefs: normalizePrefs(p.prefs),
          }))
      : [],
  };
}

function applyToStore(data: JsonXmlPersisted) {
  jsonXmlToolStore.activePresetId = data.activePresetId;
  jsonXmlToolStore.last = data.last;
  jsonXmlToolStore.presets = data.presets;
}

function snapshot(): JsonXmlPersisted {
  return {
    activePresetId: jsonXmlToolStore.activePresetId,
    last: normalizePrefs(jsonXmlToolStore.last),
    presets: jsonXmlToolStore.presets.map((p) => ({
      id: p.id,
      name: p.name,
      prefs: normalizePrefs(p.prefs),
    })),
  };
}

async function persist(data: JsonXmlPersisted) {
  const json = JSON.stringify(data);
  if (inTauri()) {
    const db = await getDb();
    if (db) await setMeta(db, META_KEY, json);
  } else {
    localStorage.setItem(STORAGE_KEY, json);
  }
}

export function getActiveJsonXmlPrefs(): JsonXmlToolPrefs {
  if (!jsonXmlToolStore.activePresetId) {
    return normalizePrefs(jsonXmlToolStore.last);
  }
  const preset = jsonXmlToolStore.presets.find(
    (p) => p.id === jsonXmlToolStore.activePresetId,
  );
  return preset ? normalizePrefs(preset.prefs) : normalizePrefs(jsonXmlToolStore.last);
}

export async function loadJsonXmlToolState() {
  if (jsonXmlToolStore.loaded) return;
  if (loading) return loading;

  loading = (async () => {
    let raw: string | null = null;
    if (inTauri()) {
      const db = await getDb();
      if (db) raw = await getMeta(db, META_KEY);
    } else {
      raw = localStorage.getItem(STORAGE_KEY);
    }
    if (raw) {
      try {
        applyToStore(normalizePersisted(JSON.parse(raw)));
      } catch {
        applyToStore({ activePresetId: "", last: defaultJsonXmlToolPrefs(), presets: [] });
      }
    }
    jsonXmlToolStore.loaded = true;
  })();

  return loading;
}

export async function saveJsonXmlToolPrefs(prefs: JsonXmlToolPrefs) {
  if (!jsonXmlToolStore.loaded) return;
  const next = normalizePrefs(prefs);
  if (!jsonXmlToolStore.activePresetId) {
    jsonXmlToolStore.last = next;
  } else {
    const preset = jsonXmlToolStore.presets.find(
      (p) => p.id === jsonXmlToolStore.activePresetId,
    );
    if (preset) preset.prefs = next;
    else jsonXmlToolStore.last = next;
  }
  await persist(snapshot());
}

export async function setJsonXmlActivePreset(id: string) {
  jsonXmlToolStore.activePresetId = id;
  await persist(snapshot());
  return getActiveJsonXmlPrefs();
}

export async function saveJsonXmlAsPreset(name: string, prefs: JsonXmlToolPrefs) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const next = normalizePrefs(prefs);
  const existing = jsonXmlToolStore.presets.find((p) => p.name === trimmed);
  if (existing) {
    existing.prefs = next;
    jsonXmlToolStore.activePresetId = existing.id;
    await persist(snapshot());
    return existing.id;
  }
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `preset-${Date.now()}`;
  jsonXmlToolStore.presets.push({ id, name: trimmed, prefs: next });
  jsonXmlToolStore.activePresetId = id;
  await persist(snapshot());
  return id;
}

export async function deleteJsonXmlPreset(id: string) {
  jsonXmlToolStore.presets = jsonXmlToolStore.presets.filter((p) => p.id !== id);
  if (jsonXmlToolStore.activePresetId === id) {
    jsonXmlToolStore.activePresetId = "";
  }
  await persist(snapshot());
}
