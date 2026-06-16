<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Button from "@/components/workhub/Button.vue";
import WhSelect from "@/components/workhub/WhSelect.vue";
import ConfirmDialog from "@/components/workhub/ConfirmDialog.vue";
import { setStatusHint } from "@/lib/workhub/status";
import { setTheme, theme, type Theme } from "@/lib/workhub/theme";
import { toast } from "@/lib/workhub/toast";
import {
  exportWorkhubData,
  importWorkhubData,
  isDataTransferCancelled,
  resetFactoryData,
} from "@/lib/workhub/dataTransfer";
import { clearAllVariableMemory } from "@/lib/workhub/snippetVariableMemory";
import {
  APP_RELEASES_URL,
  appUpdateStore,
  checkForAppUpdate,
  getAppVersion,
  refreshAppUpdateStatus,
} from "@/lib/workhub/appUpdate";
import { openUrl } from "@/lib/workhub/actions";
import { inTauri } from "@/lib/workhub/db";
import {
  setAlwaysOnTop,
  setAutoStart,
  setClipboardHistoryEnabled,
  setClipboardHistoryMax,
  setDefaultWindow,
  setLocale,
  setMainHotkey,
  setSpotlightHotkey,
  settingsStore,
  type DefaultWindow,
} from "@/lib/workhub/settingsStore";
import type { AppLocale } from "@/i18n";

const { t } = useI18n();

const THEMES = computed(() => [
  { value: "system" as Theme, label: t("settings.themeSystem") },
  { value: "light" as Theme, label: t("settings.themeLight") },
  { value: "dark" as Theme, label: t("settings.themeDark") },
]);

const LOCALES: { value: AppLocale; label: string }[] = [
  { value: "zh-CN", label: t("settings.localeZh") },
  { value: "en", label: t("settings.localeEn") },
];

const DEFAULT_WINDOW_OPTIONS = computed(() => [
  { value: "spotlight" as DefaultWindow, label: t("settings.startupSpotlight") },
  { value: "main" as DefaultWindow, label: t("settings.startupMain") },
  { value: "hidden" as DefaultWindow, label: t("settings.startupHidden") },
]);

const draftSpotlightHotkey = ref(settingsStore.spotlightHotkey);
const draftMainHotkey = ref(settingsStore.mainHotkey);

const CLIPBOARD_MAX_OPTIONS = [50, 100, 200, 500];

async function onToggleClipboardHistory() {
  try {
    await setClipboardHistoryEnabled(!settingsStore.clipboardHistoryEnabled);
    toast.success(
      settingsStore.clipboardHistoryEnabled
        ? t("settings.toastClipboardOn")
        : t("settings.toastClipboardOff"),
    );
  } catch {
    toast.error(t("settings.toastFailed"));
  }
}

async function onClipboardMaxChange(raw: string) {
  const max = Number(raw);
  if (!CLIPBOARD_MAX_OPTIONS.includes(max)) return;
  try {
    await setClipboardHistoryMax(max);
    toast.success(t("settings.toastClipboardMax"));
  } catch {
    toast.error(t("settings.toastFailed"));
  }
}

const confirmKind = ref<"import" | "reset" | "clearSnippetVars" | null>(null);
const clearingSnippetVars = ref(false);
const exporting = ref(false);
const importing = ref(false);
const resetting = ref(false);
const checkingUpdate = ref(false);
const appVersion = ref("");

const updateAvailable = computed(
  () => appUpdateStore.status === "available" && appUpdateStore.availableVersion,
);

const checkingUpdateStatus = computed(
  () => checkingUpdate.value || appUpdateStore.status === "checking",
);

const checkUpdateButtonLabel = computed(() => {
  if (checkingUpdateStatus.value) return t("settings.checkingUpdate");
  if (updateAvailable.value) return t("settings.updateInstall");
  return t("settings.checkUpdate");
});

async function onCheckUpdate() {
  if (checkingUpdate.value) return;
  checkingUpdate.value = true;
  try {
    await checkForAppUpdate(true);
  } catch {
    /* toast 已在 appUpdate 内处理 */
  } finally {
    checkingUpdate.value = false;
    void refreshAppUpdateStatus();
  }
}

function onOpenReleasesRepo() {
  void openUrl(APP_RELEASES_URL);
}

async function onExport() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    await exportWorkhubData();
    toast.success(
      inTauri() ? t("settings.toastExport") : t("settings.toastExportBrowser"),
    );
  } catch (e) {
    if (isDataTransferCancelled(e)) return;
    toast.error(e instanceof Error ? e.message : t("settings.toastExportFailed"));
  } finally {
    exporting.value = false;
  }
}

async function onConfirmImport() {
  confirmKind.value = null;
  if (importing.value) return;
  importing.value = true;
  try {
    await importWorkhubData();
    toast.success(t("settings.toastImport"));
  } catch (e) {
    if (isDataTransferCancelled(e)) return;
    toast.error(e instanceof Error ? e.message : t("settings.toastImportFailed"));
  } finally {
    importing.value = false;
  }
}

async function onConfirmReset() {
  confirmKind.value = null;
  if (resetting.value) return;
  resetting.value = true;
  try {
    await resetFactoryData();
    toast.success(t("settings.toastReset"));
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t("settings.toastResetFailed"));
  } finally {
    resetting.value = false;
  }
}

async function onConfirmClearSnippetVars() {
  confirmKind.value = null;
  if (clearingSnippetVars.value) return;
  clearingSnippetVars.value = true;
  try {
    await clearAllVariableMemory();
    toast.success(t("settings.toastClearSnippetVars"));
  } catch (e) {
    toast.error(t("settings.toastClearSnippetVarsFailed"));
  } finally {
    clearingSnippetVars.value = false;
  }
}

async function onToggleAlwaysOnTop() {
  try {
    await setAlwaysOnTop(!settingsStore.alwaysOnTop);
    toast.success(
      settingsStore.alwaysOnTop
        ? t("settings.toastAlwaysOnTopOn")
        : t("settings.toastAlwaysOnTopOff"),
    );
  } catch {
    toast.error(t("settings.toastFailed"));
  }
}

async function onToggleAutoStart() {
  try {
    await setAutoStart(!settingsStore.autoStart);
    toast.success(
      settingsStore.autoStart
        ? t("settings.toastAutoStartOn")
        : t("settings.toastAutoStartOff"),
    );
  } catch {
    toast.error(t("settings.toastFailed"));
  }
}

async function onDefaultWindowChange(mode: DefaultWindow) {
  try {
    await setDefaultWindow(mode);
    toast.success(t("settings.toastStartup"));
  } catch {
    toast.error(t("settings.toastSaveFailed"));
  }
}

async function saveSpotlightHotkey() {
  try {
    await setSpotlightHotkey(draftSpotlightHotkey.value);
    draftSpotlightHotkey.value = settingsStore.spotlightHotkey;
    toast.success(t("settings.toastSpotlightHotkey"));
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t("settings.toastHotkeyInvalid"));
  }
}

async function saveMainHotkey() {
  try {
    await setMainHotkey(draftMainHotkey.value);
    draftMainHotkey.value = settingsStore.mainHotkey;
    toast.success(t("settings.toastMainHotkey"));
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t("settings.toastHotkeyInvalid"));
  }
}

onMounted(() => {
  draftSpotlightHotkey.value = settingsStore.spotlightHotkey;
  draftMainHotkey.value = settingsStore.mainHotkey;
  setStatusHint("settings.statusHint");
  void getAppVersion().then((v) => {
    appVersion.value = v;
  });
  void refreshAppUpdateStatus();
});

async function onLocaleChange(locale: AppLocale) {
  if (locale === settingsStore.locale) return;
  try {
    await setLocale(locale);
    toast.success(t("settings.toastLocale"));
  } catch {
    toast.error(t("settings.toastFailed"));
  }
}
</script>

<template>
  <div>
    <h1 class="text-page-title mb-4">{{ t("settings.title") }}</h1>

    <!-- 通用 -->
    <section
      class="mb-4 rounded-[var(--radius-lg)] border border-border bg-surface shadow-card"
    >
      <header class="border-b border-border px-4 py-3">
        <h2 class="text-section">{{ t("settings.general") }}</h2>
      </header>
      <div class="divide-y divide-border">
        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.theme") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.themeDesc") }}
            </div>
          </div>
          <div class="flex shrink-0 gap-2">
            <button
              v-for="th in THEMES"
              :key="th.value"
              type="button"
              class="h-8 rounded-[var(--radius-md)] border px-3 text-caption"
              :class="
                theme === th.value
                  ? 'border-primary bg-[color-mix(in_oklab,var(--color-primary)_8%,transparent)] text-primary'
                  : 'border-border text-text-secondary hover:bg-surface-hover'
              "
              @click="setTheme(th.value)"
            >
              {{ th.label }}
            </button>
          </div>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.language") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.languageDesc") }}
            </div>
          </div>
          <div class="flex shrink-0 gap-2">
            <button
              v-for="loc in LOCALES"
              :key="loc.value"
              type="button"
              class="h-8 rounded-[var(--radius-md)] border px-3 text-caption"
              :class="
                settingsStore.locale === loc.value
                  ? 'border-primary bg-[color-mix(in_oklab,var(--color-primary)_8%,transparent)] text-primary'
                  : 'border-border text-text-secondary hover:bg-surface-hover'
              "
              @click="onLocaleChange(loc.value)"
            >
              {{ loc.label }}
            </button>
          </div>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.alwaysOnTop") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.alwaysOnTopDesc") }}
            </div>
          </div>
          <button
            type="button"
            class="relative h-7 w-12 shrink-0 rounded-full border transition-colors"
            :class="
              settingsStore.alwaysOnTop
                ? 'border-primary bg-primary'
                : 'border-border bg-surface-hover'
            "
            :disabled="!inTauri()"
            @click="onToggleAlwaysOnTop"
          >
            <span
              class="absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform"
              :class="settingsStore.alwaysOnTop ? 'left-[22px]' : 'left-0.5'"
            />
          </button>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.autoStart") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.autoStartDesc") }}
            </div>
          </div>
          <button
            type="button"
            class="relative h-7 w-12 shrink-0 rounded-full border transition-colors"
            :class="
              settingsStore.autoStart
                ? 'border-primary bg-primary'
                : 'border-border bg-surface-hover'
            "
            :disabled="!inTauri()"
            @click="onToggleAutoStart"
          >
            <span
              class="absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform"
              :class="settingsStore.autoStart ? 'left-[22px]' : 'left-0.5'"
            />
          </button>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.startupWindow") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.startupWindowDesc") }}
            </div>
          </div>
          <div class="w-44 shrink-0">
            <WhSelect
              :model-value="settingsStore.defaultWindow"
              :disabled="!inTauri()"
              @update:model-value="onDefaultWindowChange($event as DefaultWindow)"
            >
              <option
                v-for="opt in DEFAULT_WINDOW_OPTIONS"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </WhSelect>
          </div>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.clipboardHistory") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.clipboardHistoryDesc") }}
            </div>
          </div>
          <button
            type="button"
            class="relative h-7 w-12 shrink-0 rounded-full border transition-colors"
            :class="
              settingsStore.clipboardHistoryEnabled
                ? 'border-primary bg-primary'
                : 'border-border bg-surface-hover'
            "
            :disabled="!inTauri()"
            @click="onToggleClipboardHistory"
          >
            <span
              class="absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform"
              :class="
                settingsStore.clipboardHistoryEnabled ? 'left-[22px]' : 'left-0.5'
              "
            />
          </button>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.clipboardMax") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.clipboardMaxDesc") }}
            </div>
          </div>
          <div class="w-28 shrink-0">
            <WhSelect
              :model-value="String(settingsStore.clipboardHistoryMax)"
              :disabled="!inTauri() || !settingsStore.clipboardHistoryEnabled"
              @update:model-value="onClipboardMaxChange"
            >
              <option
                v-for="n in CLIPBOARD_MAX_OPTIONS"
                :key="n"
                :value="String(n)"
              >
                {{ t("settings.clipboardMaxUnit", { n }) }}
              </option>
            </WhSelect>
          </div>
        </div>
      </div>
    </section>

    <!-- 快捷键 -->
    <section
      class="mb-4 rounded-[var(--radius-lg)] border border-border bg-surface shadow-card"
    >
      <header class="border-b border-border px-4 py-3">
        <h2 class="text-section">{{ t("settings.hotkeys") }}</h2>
      </header>
      <div class="divide-y divide-border">
        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.hotkeySpotlight") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.hotkeySpotlightDesc") }}
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <input
              v-model="draftSpotlightHotkey"
              type="text"
              class="text-mono h-9 w-36 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-body"
              :disabled="!inTauri()"
              placeholder="Alt+X"
              @keydown.enter="saveSpotlightHotkey"
            />
            <Button
              variant="secondary"
              :disabled="!inTauri()"
              @click="saveSpotlightHotkey"
            >
              {{ t("common.save") }}
            </Button>
          </div>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.hotkeyMain") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.hotkeyMainDesc") }}
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <input
              v-model="draftMainHotkey"
              type="text"
              class="text-mono h-9 w-36 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-body"
              :disabled="!inTauri()"
              placeholder="Alt+Z"
              @keydown.enter="saveMainHotkey"
            />
            <Button
              variant="secondary"
              :disabled="!inTauri()"
              @click="saveMainHotkey"
            >
              {{ t("common.save") }}
            </Button>
          </div>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.quitApp") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.quitAppDesc") }}
            </div>
          </div>
          <kbd
            class="text-mono inline-flex h-9 min-w-[160px] items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface px-3 text-body text-text-secondary"
          >
            Ctrl+Alt+Q
          </kbd>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.listOps") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.listOpsDesc") }}
            </div>
          </div>
          <div
            class="grid shrink-0 grid-cols-2 gap-x-6 gap-y-1 text-caption text-text-secondary"
          >
            <span>{{ t("settings.listNav") }}</span>
            <span>{{ t("settings.listEnter") }}</span>
            <span>{{ t("settings.listDetail") }}</span>
            <span>{{ t("settings.listCopy") }}</span>
            <span>{{ t("settings.listFavorite") }}</span>
            <span>{{ t("settings.listDelete") }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 数据管理 -->
    <section
      class="mb-4 rounded-[var(--radius-lg)] border border-border bg-surface shadow-card"
    >
      <header class="border-b border-border px-4 py-3">
        <h2 class="text-section">{{ t("settings.data") }}</h2>
      </header>
      <div class="divide-y divide-border">
        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.checkUpdate") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.checkUpdateDesc") }}
            </div>
            <div
              v-if="appVersion"
              class="mt-1 text-caption text-text-placeholder"
            >
              {{ t("settings.currentVersion") }}: {{ appVersion }}
            </div>
            <div
              v-if="updateAvailable"
              class="mt-1 flex items-center gap-1.5 text-caption text-primary"
            >
              <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {{ t("settings.updateAvailable", { version: appUpdateStore.availableVersion }) }}
            </div>
            <button
              type="button"
              class="mt-1 text-caption text-primary hover:underline"
              @click="onOpenReleasesRepo"
            >
              {{ t("settings.openReleasesRepo") }}
            </button>
          </div>
          <Button
            class="shrink-0 whitespace-nowrap"
            :variant="updateAvailable ? 'primary' : 'secondary'"
            :disabled="!inTauri() || checkingUpdateStatus"
            @click="onCheckUpdate"
          >
            {{ checkUpdateButtonLabel }}
          </Button>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.exportData") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.exportDataDesc") }}
            </div>
          </div>
          <Button class="w-28 shrink-0" :disabled="exporting" @click="onExport">
            {{ exporting ? t("common.exporting") : t("common.export") }}
          </Button>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.importData") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.importDataDesc") }}
            </div>
          </div>
          <Button
            class="w-28 shrink-0"
            variant="secondary"
            :disabled="importing"
            @click="confirmKind = 'import'"
          >
            {{ importing ? t("common.importing") : t("common.import") }}
          </Button>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.clearSnippetVars") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.clearSnippetVarsDesc") }}
            </div>
          </div>
          <Button
            class="w-28 shrink-0"
            variant="secondary"
            :disabled="clearingSnippetVars"
            @click="confirmKind = 'clearSnippetVars'"
          >
            {{ clearingSnippetVars ? t("common.clearing") : t("common.clear") }}
          </Button>
        </div>

        <div class="flex items-start justify-between gap-6 px-4 py-3">
          <div class="min-w-0">
            <div class="text-body text-text">{{ t("settings.resetData") }}</div>
            <div class="mt-0.5 text-caption text-text-secondary">
              {{ t("settings.resetDataDesc") }}
            </div>
          </div>
          <Button
            class="w-28 shrink-0"
            variant="danger"
            :disabled="resetting"
            @click="confirmKind = 'reset'"
          >
            {{ resetting ? t("common.resetting") : t("common.reset") }}
          </Button>
        </div>
      </div>
    </section>

    <ConfirmDialog
      :open="confirmKind === 'import'"
      :title="t('settings.importTitle')"
      :description="t('settings.importDesc')"
      :confirm-text="t('common.overwriteImport')"
      @cancel="confirmKind = null"
      @confirm="onConfirmImport"
    />
    <ConfirmDialog
      :open="confirmKind === 'reset'"
      :title="t('settings.resetTitle')"
      :description="t('settings.resetDesc')"
      :confirm-text="t('common.confirmReset')"
      @cancel="confirmKind = null"
      @confirm="onConfirmReset"
    />
    <ConfirmDialog
      :open="confirmKind === 'clearSnippetVars'"
      :title="t('settings.clearSnippetVarsTitle')"
      :description="t('settings.clearSnippetVarsConfirm')"
      :confirm-text="t('common.clear')"
      :danger="false"
      @cancel="confirmKind = null"
      @confirm="onConfirmClearSnippetVars"
    />
  </div>
</template>
