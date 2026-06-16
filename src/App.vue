<script setup lang="ts">
import { ref } from 'vue'

import Shell from '@/components/workhub/Shell.vue'

import SpotlightShell from '@/components/workhub/SpotlightShell.vue'

import { inTauri } from '@/lib/workhub/db'

import { setWindowLabel, type WindowLabel } from '@/lib/workhub/windowActions'

const bootError = ref('')

function detectMode(): WindowLabel {
  if (!inTauri()) return 'main'

  try {
    const internals = (
      window as Window & {
        __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } }
      }
    ).__TAURI_INTERNALS__

    const label = internals?.metadata?.currentWindow?.label

    if (label === 'spotlight') {
      setWindowLabel(label)

      return label
    }
  } catch (e) {
    bootError.value = e instanceof Error ? e.message : String(e)
  }

  setWindowLabel('main')

  return 'main'
}

const mode = ref<WindowLabel>(detectMode())
</script>

<template>
  <div
    v-if="bootError"
    class="flex h-screen items-center justify-center bg-[#f5f6f8] p-6 text-sm text-[#d54941]"
  >
    WorkHub 启动失败：{{ bootError }}
  </div>

  <SpotlightShell v-else-if="mode === 'spotlight'" />

  <Shell v-else />
</template>
