<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import WhIcon from "./WhIcon.vue";
import { copyText } from "@/lib/workhub/actions";
import "highlight.js/styles/github.min.css";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

const props = withDefaults(
  defineProps<{
    code: string;
    language?: string;
    category?: string;
    successText?: string;
  }>(),
  { successText: undefined },
);

const { t } = useI18n();
const copySuccessText = computed(
  () => props.successText ?? t("toast.codeCopied"),
);

const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  md: "markdown",
  vue: "xml",
  html: "xml",
  docker: "dockerfile",
};

function resolveLanguage(language?: string, category?: string): string | undefined {
  const raw = (language || "").trim().toLowerCase();
  if (raw) {
    const key = LANG_ALIASES[raw] ?? raw;
    if (hljs.getLanguage(key)) return key;
  }
  const cat = (category || "").toLowerCase();
  if (cat === "shell") return "bash";
  if (cat === "sql") return "sql";
  if (cat === "git") return "bash";
  if (cat === "正则") return "javascript";
  return undefined;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightLine(line: string, language?: string): string {
  if (!line) return " ";
  if (!language || !hljs.getLanguage(language)) return escapeHtml(line);
  try {
    return hljs.highlight(line, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(line);
  }
}

const languageLabel = computed(
  () => resolveLanguage(props.language, props.category) ?? props.language ?? "code",
);

const rows = computed(() => {
  const lang = resolveLanguage(props.language, props.category);
  return props.code.split("\n").map((line, index) => ({
    no: index + 1,
    html: highlightLine(line, lang),
  }));
});
</script>

<template>
  <div
    class="code-viewer relative overflow-hidden rounded-[var(--radius-md)] border border-border bg-[#f6f8fa] dark:bg-[#0d1117]"
  >
    <div
      class="flex items-center justify-between border-b border-border bg-surface px-3 py-2"
    >
      <span class="text-caption text-text-secondary">{{ languageLabel }}</span>
      <button
        type="button"
        :aria-label="t('common.copyCode')"
        class="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
        @click="copyText(code, copySuccessText)"
      >
        <WhIcon name="copy" :size="14" /> {{ t("common.copy") }}
      </button>
    </div>
    <div class="text-mono overflow-x-auto py-2">
      <div v-for="row in rows" :key="row.no" class="flex">
        <span class="w-10 shrink-0 select-none pr-3 text-right text-text-placeholder">
          {{ row.no }}
        </span>
        <span class="hljs min-w-0 flex-1 whitespace-pre bg-transparent p-0" v-html="row.html" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.code-viewer :deep(.hljs) {
  background: transparent;
  padding: 0;
}
</style>

<!-- 深色主题：覆盖 github 浅色 token，避免黑字看不清 -->
<style>
html.dark .code-viewer .hljs {
  color: #c9d1d9;
  background: transparent;
}

html.dark .code-viewer .hljs-doctag,
html.dark .code-viewer .hljs-keyword,
html.dark .code-viewer .hljs-meta .hljs-keyword,
html.dark .code-viewer .hljs-template-tag,
html.dark .code-viewer .hljs-template-variable,
html.dark .code-viewer .hljs-type,
html.dark .code-viewer .hljs-variable.language_ {
  color: #ff7b72;
}

html.dark .code-viewer .hljs-title,
html.dark .code-viewer .hljs-title.class_,
html.dark .code-viewer .hljs-title.class_.inherited__,
html.dark .code-viewer .hljs-title.function_ {
  color: #d2a8ff;
}

html.dark .code-viewer .hljs-attr,
html.dark .code-viewer .hljs-attribute,
html.dark .code-viewer .hljs-literal,
html.dark .code-viewer .hljs-meta,
html.dark .code-viewer .hljs-number,
html.dark .code-viewer .hljs-operator,
html.dark .code-viewer .hljs-selector-attr,
html.dark .code-viewer .hljs-selector-class,
html.dark .code-viewer .hljs-selector-id,
html.dark .code-viewer .hljs-variable {
  color: #79c0ff;
}

html.dark .code-viewer .hljs-meta .hljs-string,
html.dark .code-viewer .hljs-regexp,
html.dark .code-viewer .hljs-string {
  color: #a5d6ff;
}

html.dark .code-viewer .hljs-built_in,
html.dark .code-viewer .hljs-symbol {
  color: #ffa657;
}

html.dark .code-viewer .hljs-code,
html.dark .code-viewer .hljs-comment,
html.dark .code-viewer .hljs-formula {
  color: #8b949e;
}

html.dark .code-viewer .hljs-name,
html.dark .code-viewer .hljs-quote,
html.dark .code-viewer .hljs-selector-pseudo,
html.dark .code-viewer .hljs-selector-tag {
  color: #7ee787;
}

html.dark .code-viewer .hljs-subst,
html.dark .code-viewer .hljs-emphasis,
html.dark .code-viewer .hljs-strong {
  color: #c9d1d9;
}

html.dark .code-viewer .hljs-section {
  color: #1f6feb;
  font-weight: 700;
}

html.dark .code-viewer .hljs-bullet {
  color: #f2cc60;
}

html.dark .code-viewer .hljs-addition {
  color: #aff5b4;
  background-color: #033a16;
}

html.dark .code-viewer .hljs-deletion {
  color: #ffdcd7;
  background-color: #67060c;
}
</style>
