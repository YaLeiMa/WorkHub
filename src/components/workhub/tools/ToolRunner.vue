<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "../Button.vue";
import WhIcon from "../WhIcon.vue";
import DynamicToolForm from "./DynamicToolForm.vue";
import ToolResultView from "./ToolResultView.vue";
import { copyText } from "@/lib/workhub/actions";
import { inTauri } from "@/lib/workhub/db";
import { toast } from "@/lib/workhub/toast";
import { setStatusHint } from "@/lib/workhub/status";
import { toolDesc } from "@/lib/workhub/tools/registry";
import type {
  ToolContext,
  ToolDefinition,
  ToolResultView as ToolResultViewType,
  ToolValues,
} from "@/lib/workhub/tools/types";

const props = withDefaults(
  defineProps<{
    tool: ToolDefinition;
    /** 紧凑布局（悬浮窗内） */
    compact?: boolean;
  }>(),
  { compact: false },
);

const { t } = useI18n();

const values = ref<ToolValues>({});
const result = ref<ToolResultViewType | null>(null);
const running = ref(false);
const formRef = ref<InstanceType<typeof DynamicToolForm> | null>(null);
const resultRef = ref<HTMLElement | null>(null);

const isLive = computed(() => props.tool.runMode === "live");

const ctx: ToolContext = {
  async invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!inTauri()) throw new Error("not in tauri");
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  },
  copy: (text: string, successText?: string) => copyText(text, successText),
  toast,
  t: (key: string, named?: Record<string, unknown>) =>
    named ? t(key, named) : t(key),
};

function initValues(tool: ToolDefinition) {
  const next: ToolValues = {};
  for (const field of tool.fields ?? []) {
    next[field.key] = field.default ?? (field.type === "switch" ? false : "");
  }
  values.value = next;
  result.value = null;
}

async function scrollToResult() {
  if (!result.value || result.value.type !== "image") return;
  await nextTick();
  requestAnimationFrame(() => {
    resultRef.value?.scrollIntoView({ behavior: "smooth", block: "end" });
  });
}

async function run() {
  if (!props.tool.run) return;
  running.value = true;
  try {
    result.value = await props.tool.run(values.value, ctx);
  } catch (e) {
    result.value = {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  } finally {
    running.value = false;
    void scrollToResult();
  }
}

/** manual 工具：Enter 运行；textarea 内 Shift+Enter 换行 */
function onManualKey(e: KeyboardEvent) {
  if (isLive.value || !props.tool.run || props.tool.component) return;
  if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target as HTMLElement;
  if (target.tagName === "BUTTON" || target.tagName === "SELECT") return;
  e.preventDefault();
  e.stopPropagation();
  if (!running.value) void run();
}

let liveTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  values,
  () => {
    if (!isLive.value) return;
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = setTimeout(() => void run(), 150);
  },
  { deep: true },
);

watch(
  () => props.tool.id,
  () => {
    initValues(props.tool);
    if (isLive.value) void run();
    void nextTick(() => formRef.value?.focusFirst());
    if (props.tool.id === "qrcode" && !isLive.value) {
      setStatusHint("tools.qrcode.statusHint");
    }
  },
);

onMounted(() => {
  initValues(props.tool);
  if (isLive.value) void run();
  void nextTick(() => formRef.value?.focusFirst());
  if (props.tool.id === "qrcode" && !isLive.value) {
    setStatusHint("tools.qrcode.statusHint");
  }
});

onUnmounted(() => {
  if (liveTimer) clearTimeout(liveTimer);
  if (props.tool.id === "qrcode") setStatusHint("tools.statusHint");
});
</script>

<template>
  <section
    class="flex flex-col outline-none"
    :class="[
      compact ? 'gap-3' : 'gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-card',
    ]"
    tabindex="-1"
    @keydown="onManualKey"
  >
    <p
      v-if="!compact && toolDesc(tool)"
      class="text-caption text-text-secondary"
    >
      {{ toolDesc(tool) }}
    </p>

    <!-- 逃生舱：自定义组件 -->
    <component
      :is="tool.component"
      v-if="tool.component"
      :ctx="ctx"
      :compact="compact"
    />

    <!-- 声明式：动态表单 + 结果 -->
    <template v-else>
      <DynamicToolForm
        v-if="tool.fields && tool.fields.length"
        ref="formRef"
        :fields="tool.fields ?? []"
        v-model="values"
      />

      <div v-if="!isLive">
        <Button variant="primary" :disabled="running" @click="run">
          <WhIcon name="command" :size="16" />
          {{ running ? t("tools.result.running") : t("tools.result.run") }}
        </Button>
      </div>

      <div v-if="result" ref="resultRef">
        <ToolResultView :result="result" />
      </div>
    </template>
  </section>
</template>
