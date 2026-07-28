<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import Modal from "./Modal.vue";
import Field from "./Field.vue";
import WhInput from "./WhInput.vue";
import {
  cancelWorkflowRun,
  confirmWorkflowRun,
  workflowRunState,
} from "@/lib/workhub/workflowRunPrompt";

const { t } = useI18n();

const title = computed(() => {
  const name = workflowRunState.workflow?.title;
  return name
    ? t("workflow.variableDialogTitleNamed", { name })
    : t("workflow.variableDialogTitle");
});

function onSubmit() {
  void confirmWorkflowRun();
}
</script>

<template>
  <Modal
    :open="workflowRunState.open"
    :title="title"
    :submit-text="t('workflow.run')"
    :cancel-text="t('common.cancel')"
    :width="440"
    @close="cancelWorkflowRun"
    @submit="onSubmit"
  >
    <p class="mb-4 text-body text-text-secondary">
      {{ t("workflow.variableDialogDesc") }}
    </p>
    <Field
      v-for="(v, i) in workflowRunState.variables"
      :key="v.name"
      :label="v.name"
    >
      <WhInput
        v-model="workflowRunState.values[v.name]"
        :placeholder="v.defaultValue || t('snippet.variablePlaceholder')"
        :autofocus="i === 0"
      />
    </Field>
  </Modal>
</template>
