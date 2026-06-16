<script setup lang="ts">
import iconSrc from "@/assets/workhub-icon.png";

withDefaults(
  defineProps<{
    size?: number;
    imgClass?: string;
  }>(),
  { size: 28 },
);
</script>

<template>
  <img
    :src="iconSrc"
    alt="WorkHub"
    draggable="false"
    :class="['block shrink-0 object-contain rounded-[22%]', imgClass]"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      minWidth: `${size}px`,
      minHeight: `${size}px`,
    }"
  />
</template>
