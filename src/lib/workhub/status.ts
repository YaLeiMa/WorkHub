import { ref } from "vue";

/** 底部状态栏文案的 i18n 键（切换语言时会自动重译） */
export const statusHintKey = ref("status.default");

export function setStatusHint(key: string) {
  statusHintKey.value = key;
}
