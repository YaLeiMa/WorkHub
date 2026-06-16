<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import Modal from "./Modal.vue";
import Field from "./Field.vue";
import WhInput from "./WhInput.vue";
import {
  cancelSnippetCopy,
  confirmSnippetCopy,
  snippetCopyState,
} from "@/lib/workhub/snippetCopy";

const { t } = useI18n();

const title = computed(() => {
  const name = snippetCopyState.snippet?.title;
  return name
    ? t("snippet.variableDialogTitleNamed", { name })
    : t("snippet.variableDialogTitle");
});

function onSubmit() {
  void confirmSnippetCopy();
}
</script>

<template>
  <Modal
    :open="snippetCopyState.open"
    :title="title"
    :submit-text="t('snippet.variableDialogCopy')"
    :cancel-text="t('common.cancel')"
    :width="440"
    @close="cancelSnippetCopy"
    @submit="onSubmit"
  >
    <p class="mb-4 text-body text-text-secondary">
      {{ t("snippet.variableDialogDesc") }}
    </p>
    <Field
      v-for="(v, i) in snippetCopyState.variables"
      :key="v.name"
      :label="v.name"
    >
      <WhInput
        v-model="snippetCopyState.values[v.name]"
        :placeholder="v.defaultValue || t('snippet.variablePlaceholder')"
        :autofocus="i === 0"
      />
    </Field>
  </Modal>
</template>
