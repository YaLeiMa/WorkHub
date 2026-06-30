<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import WhIcon from "../WhIcon.vue";
import WhTextarea from "../WhTextarea.vue";
import type { ToolContext } from "@/lib/workhub/tools/types";
import { inTauri } from "@/lib/workhub/db";
import { isImagePath, useFileDropZone } from "@/lib/workhub/useFileDropZone";
import { isListCopyChord } from "@/lib/workhub/listKeys";
import { setStatusHint } from "@/lib/workhub/status";

const props = withDefaults(
  defineProps<{
    ctx: ToolContext;
    compact?: boolean;
  }>(),
  { compact: false },
);

const { t } = useI18n();

type Mode = "text" | "image";
type Direction = "encode" | "decode";

const mode = ref<Mode>("text");
const direction = ref<Direction>("encode");
const textInput = ref("");

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const textResult = computed<{ ok: boolean; value: string }>(() => {
  const input = textInput.value;
  if (!input.trim()) return { ok: true, value: "" };
  try {
    if (direction.value === "encode") {
      return { ok: true, value: bytesToBase64(new TextEncoder().encode(input)) };
    }
    return { ok: true, value: new TextDecoder().decode(base64ToBytes(input)) };
  } catch {
    return { ok: false, value: t("tools.base64.decodeError") };
  }
});

function copyTextResult() {
  if (!textResult.value.ok || !textResult.value.value) return;
  props.ctx.copy(textResult.value.value, t("tools.base64.copied"));
}

const imageDataUrl = ref("");
const dragOver = ref(false);
const previewBroken = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const dropZoneRef = ref<HTMLElement | null>(null);
const textInputRef = ref<InstanceType<typeof WhTextarea> | null>(null);
const imageDataRef = ref<HTMLTextAreaElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const fileMeta = ref<{ name: string; size: number } | null>(null);

const hasImage = computed(() => !!imageDataUrl.value.trim());
const previewSrc = computed(() => normalizeToDataUrl(imageDataUrl.value));

const sizeLabel = computed(() => {
  if (!fileMeta.value) {
    const len = imageDataUrl.value.trim().length;
    if (!len) return "";
    return `${(len / 1024).toFixed(1)} KB`;
  }
  return `${(fileMeta.value.size / 1024).toFixed(1)} KB`;
});

const splitClass = computed(() =>
  props.compact
    ? "grid grid-cols-1 gap-3"
    : "grid grid-cols-1 gap-4 md:grid-cols-2",
);

function detectImageMime(b64: string): string {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  if (b64.startsWith("UklGR")) return "image/webp";
  if (b64.startsWith("PHN2Zy") || b64.startsWith("PD94")) return "image/svg+xml";
  return "image/png";
}

function normalizeToDataUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.startsWith("data:")) return v;
  return `data:${detectImageMime(v)};base64,${v}`;
}

function loadFile(file: File) {
  if (!file.type.startsWith("image/")) {
    props.ctx.toast.error(t("tools.base64.notImage"));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    imageDataUrl.value = String(reader.result ?? "");
    fileMeta.value = { name: file.name, size: file.size };
    previewBroken.value = false;
  };
  reader.onerror = () => props.ctx.toast.error(t("tools.base64.readError"));
  reader.readAsDataURL(file);
}

async function loadImagePath(path: string) {
  if (!isImagePath(path)) {
    props.ctx.toast.error(t("tools.base64.notImage"));
    return;
  }
  try {
    if (inTauri()) {
      const payload = await props.ctx.invoke<{
        dataUrl: string;
        name: string;
        size: number;
      }>("read_image_file", { path });
      imageDataUrl.value = payload.dataUrl;
      fileMeta.value = { name: payload.name, size: payload.size };
    } else {
      props.ctx.toast.error(t("tools.base64.readError"));
      return;
    }
    previewBroken.value = false;
  } catch {
    props.ctx.toast.error(t("tools.base64.readError"));
  }
}

useFileDropZone(dropZoneRef, {
  enabled: () => mode.value === "image",
  onHoverChange: (over) => {
    dragOver.value = over;
  },
  onFiles: (files) => {
    const file = files.find((f) => f.type.startsWith("image/")) ?? files[0];
    if (file) loadFile(file);
  },
  onPaths: (paths) => {
    const path = paths.find(isImagePath) ?? paths[0];
    if (path) void loadImagePath(path);
  },
});

function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) loadFile(file);
  (e.target as HTMLInputElement).value = "";
}

function onPaste(e: ClipboardEvent) {
  if (mode.value !== "image") return;
  const file = Array.from(e.clipboardData?.items ?? [])
    .find((i) => i.type.startsWith("image/"))
    ?.getAsFile();
  if (file) {
    e.preventDefault();
    loadFile(file);
  }
}

function onManualInput(v: string) {
  imageDataUrl.value = v;
  fileMeta.value = null;
  previewBroken.value = false;
}

function copyImageBase64() {
  if (!imageDataUrl.value.trim()) return;
  props.ctx.copy(imageDataUrl.value, t("tools.base64.copied"));
}

function clearImage() {
  imageDataUrl.value = "";
  fileMeta.value = null;
  previewBroken.value = false;
}

function pickImage() {
  fileInput.value?.click();
}

function focusModePrimary(m: Mode = mode.value) {
  if (m === "text") {
    textInputRef.value?.focus();
    textInputRef.value?.select();
    return;
  }
  if (hasImage.value) {
    imageDataRef.value?.focus();
  } else {
    dropZoneRef.value?.focus();
  }
}

function setMode(next: Mode) {
  mode.value = next;
  void nextTick(() => focusModePrimary(next));
}

function canSwitchModeByArrow(e: KeyboardEvent, to: Mode): boolean {
  const target = e.target as HTMLElement;
  if (target.tagName !== "TEXTAREA") return true;
  const ta = target as HTMLTextAreaElement;
  if (to === "text") {
    return ta.selectionStart === 0 && ta.selectionEnd === 0;
  }
  const len = ta.value.length;
  return ta.selectionStart === len && ta.selectionEnd === len;
}

function copyCurrent() {
  if (mode.value === "text") {
    copyTextResult();
  } else {
    copyImageBase64();
  }
}

function clearCurrent() {
  if (mode.value === "text") {
    textInput.value = "";
    void nextTick(() => focusModePrimary("text"));
    return;
  }
  clearImage();
  void nextTick(() => focusModePrimary("image"));
}

function onKey(e: KeyboardEvent) {
  if (isListCopyChord(e)) {
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") {
      const ta = target as HTMLTextAreaElement;
      if (ta.selectionStart !== ta.selectionEnd) return;
    }
    e.preventDefault();
    e.stopPropagation();
    copyCurrent();
    return;
  }

  if (e.key === "ArrowUp" && canSwitchModeByArrow(e, "text")) {
    e.preventDefault();
    e.stopPropagation();
    setMode("text");
    return;
  }
  if (e.key === "ArrowDown" && canSwitchModeByArrow(e, "image")) {
    e.preventDefault();
    e.stopPropagation();
    setMode("image");
    return;
  }

  if (e.key === "Enter" && mode.value === "image") {
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return;
    e.preventDefault();
    e.stopPropagation();
    pickImage();
    return;
  }

  if (e.key === "Delete" && rootRef.value?.contains(e.target as Node)) {
    e.preventDefault();
    e.stopPropagation();
    clearCurrent();
  }
}

watch(mode, () => {
  setStatusHint("tools.base64.statusHint");
});

onMounted(() => {
  window.addEventListener("paste", onPaste);
  setStatusHint("tools.base64.statusHint");
  void nextTick(() => focusModePrimary("text"));
});

onUnmounted(() => {
  window.removeEventListener("paste", onPaste);
  setStatusHint("tools.statusHint");
});
</script>

<template>
  <div
    ref="rootRef"
    class="flex flex-col gap-4 outline-none"
    tabindex="-1"
    @keydown="onKey"
  >
    <!-- 工具栏：左模式 Tab + 右编码/解码（文本模式） -->
    <div
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border"
      role="tablist"
    >
      <div class="flex gap-5">
        <button
          v-for="m in (['text', 'image'] as Mode[])"
          :key="m"
          type="button"
          role="tab"
          :aria-selected="mode === m"
          class="relative -mb-px pb-2.5 text-body transition-colors"
          :class="
            mode === m
              ? 'font-medium text-text after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
              : 'text-text-secondary hover:text-text'
          "
          @click="setMode(m)"
        >
          {{ m === "text" ? t("tools.base64.modeText") : t("tools.base64.modeImage") }}
        </button>
      </div>

      <div
        v-if="mode === 'text'"
        class="flex items-center gap-1 pb-2 text-caption"
        role="tablist"
      >
        <button
          v-for="d in (['encode', 'decode'] as Direction[])"
          :key="d"
          type="button"
          role="tab"
          :aria-selected="direction === d"
          class="rounded-[var(--radius-sm)] px-2 py-0.5 transition-colors"
          :class="
            direction === d
              ? 'bg-surface-active text-primary'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text'
          "
          @click="direction = d"
        >
          {{ d === "encode" ? t("tools.base64.encode") : t("tools.base64.decode") }}
        </button>
      </div>
    </div>

    <!-- 文本模式：左右分栏 -->
    <template v-if="mode === 'text'">
      <div :class="splitClass">
        <div class="flex min-h-0 flex-col gap-1.5">
          <span class="text-caption font-medium text-text-secondary">
            {{ t("tools.base64.input") }}
          </span>
          <WhTextarea
            ref="textInputRef"
            v-model="textInput"
            mono
            :placeholder="
              direction === 'encode'
                ? t('tools.base64.encodePlaceholder')
                : t('tools.base64.decodePlaceholder')
            "
          />
        </div>

        <div class="flex min-h-0 flex-col gap-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-caption font-medium text-text-secondary">
              {{ t("tools.base64.output") }}
            </span>
            <button
              v-if="textResult.ok && textResult.value"
              type="button"
              class="inline-flex h-7 shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-caption text-primary hover:bg-primary/10"
              @click="copyTextResult"
            >
              <WhIcon name="copy" :size="14" /> {{ t("common.copy") }}
            </button>
          </div>
          <div
            v-if="!textInput.trim()"
            class="flex flex-1 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-border bg-surface px-3 py-8 text-center text-caption text-text-secondary"
          >
            {{ t("tools.base64.outputEmpty") }}
          </div>
          <div
            v-else-if="!textResult.ok"
            class="rounded-[var(--radius-md)] border border-danger/40 bg-danger/10 px-3 py-2 text-body text-danger"
          >
            {{ textResult.value }}
          </div>
          <pre
            v-else
            class="text-mono min-h-[160px] flex-1 scroll-y whitespace-pre-wrap break-all rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-body text-text"
          >{{ textResult.value }}</pre>
        </div>
      </div>
    </template>

    <!-- 图片模式：预览与 Base64 同屏 -->
    <template v-else>
      <div
        :class="
          compact
            ? 'grid grid-cols-1 gap-3'
            : 'grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,280px)_1fr]'
        "
      >
        <!-- 左侧：预览 / 拖放 -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-caption font-medium text-text-secondary">
              {{ t("tools.base64.preview") }}
              <span v-if="sizeLabel" class="font-normal">· {{ sizeLabel }}</span>
            </span>
            <div v-if="hasImage" class="flex gap-1">
              <button
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                @click="pickImage"
              >
                {{ t("tools.base64.replace") }}
              </button>
              <button
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-caption text-text-secondary hover:bg-surface-hover"
                @click="clearImage"
              >
                <WhIcon name="close" :size="14" />
              </button>
            </div>
          </div>

          <div
            ref="dropZoneRef"
            tabindex="0"
            class="relative flex min-h-[200px] flex-1 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed transition-colors outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
            :class="
              dragOver
                ? 'border-primary bg-primary/5'
                : hasImage
                  ? 'border-border bg-[color-mix(in_oklab,var(--color-surface-hover)_40%,transparent)]'
                  : 'border-border bg-surface hover:border-primary/40'
            "
            @click="!hasImage && pickImage()"
          >
            <template v-if="hasImage">
              <p v-if="previewBroken" class="px-4 text-center text-caption text-danger">
                {{ t("tools.base64.previewError") }}
              </p>
              <img
                v-else
                :src="previewSrc"
                alt=""
                class="max-h-[min(240px,40vh)] max-w-full rounded-[var(--radius-sm)] bg-white p-1 shadow-sm"
                @error="previewBroken = true"
                @click.stop
              />
              <p
                v-if="fileMeta?.name"
                class="mt-2 max-w-full truncate px-3 text-center text-caption text-text-secondary"
              >
                {{ fileMeta.name }}
              </p>
            </template>
            <template v-else>
              <WhIcon name="image" :size="32" class="mb-2 text-text-secondary" />
              <p class="px-4 text-center text-body text-text">
                {{ t("tools.base64.dropHint") }}
              </p>
              <p class="mt-1 px-4 text-center text-caption text-text-secondary">
                {{ t("tools.base64.dropSub") }}
              </p>
              <button
                type="button"
                class="mt-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-1.5 text-caption text-text hover:bg-surface-hover"
                @click.stop="pickImage"
              >
                {{ t("tools.base64.pickImage") }}
              </button>
            </template>
          </div>
        </div>

        <!-- 右侧：Base64 数据 -->
        <div class="flex min-h-[200px] flex-col gap-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-caption font-medium text-text-secondary">
              {{ t("tools.base64.imageData") }}
            </span>
            <button
              v-if="hasImage"
              type="button"
              class="inline-flex h-7 shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-caption text-primary hover:bg-primary/10"
              @click="copyImageBase64"
            >
              <WhIcon name="copy" :size="14" /> {{ t("common.copy") }}
            </button>
          </div>
          <textarea
            ref="imageDataRef"
            :value="imageDataUrl"
            :placeholder="t('tools.base64.imageDataPlaceholder')"
            class="text-mono min-h-[200px] flex-1 resize-none rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-text outline-none focus:border-primary md:min-h-0"
            @input="onManualInput(($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onPick"
      />
    </template>
  </div>
</template>