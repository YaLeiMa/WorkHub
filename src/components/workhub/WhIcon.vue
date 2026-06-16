<script setup lang="ts">

import { computed } from "vue";



export type IconName =

  | "search"

  | "home"

  | "project"

  | "snippet"

  | "star"

  | "settings"

  | "link"

  | "command"

  | "file"

  | "folder"

  | "doc"

  | "plus"

  | "close"

  | "copy"

  | "clipboard"

  | "image"

  | "archive";



const props = withDefaults(

  defineProps<{

    name: IconName;

    size?: number;

    /** 仅 star 支持填充态 */

    filled?: boolean;

  }>(),

  { size: 20, filled: false },

);



// 线性图标路径，描边 1.5px（规范 §6）

const PATHS: Record<IconName, string[]> = {

  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "m20 20-3.5-3.5"],

  home: ["M4 10.5 12 4l8 6.5", "M6 9.5V20h12V9.5"],

  project: [

    "M12 3 3 8l9 5 9-5-9-5z",

    "M3 13l9 5 9-5",

    "M3 18l9 5 9-5",

  ],

  snippet: ["M10 8 4 12l6 4", "M14 8l6 4-6 4", "M13 5 11 19"],

  star: ["m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.9z"],

  settings: [

    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",

    "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",

  ],

  link: [

    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",

    "M3 12h18",

    "M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9",

    "M12 3a15 15 0 0 0-4 9 15 15 0 0 0 4 9",

  ],

  command: ["M6 8 2 12l4 4", "M10 12h12"],

  file: ["M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z", "M14 3v6h6"],

  folder: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],

  doc: ["M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z", "M14 3v6h6"],

  plus: ["M12 5v14M5 12h14"],

  close: ["M6 6l12 12M18 6 6 18"],

  copy: ["M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2", "M14 4H6a2 2 0 0 0-2 2v14"],

  clipboard: [

    "M9 5h6a1 1 0 0 1 1 1v1H8V6a1 1 0 0 1 1-1z",

    "M8 7h8v13a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V7z",

  ],

  image: [

    "M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z",

    "m8 11 2 2 3-3 3 4",

    "M9 9h.01",

  ],

  archive: [

    "M4 7h16v3H4z",

    "M6 10v9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-9",

    "M10 14h4",

  ],

};



const paths = computed(() => PATHS[props.name]);

const fill = computed(() =>

  props.name === "star" && props.filled ? "currentColor" : "none",

);

</script>



<template>

  <svg

    :width="size"

    :height="size"

    viewBox="0 0 24 24"

    fill="none"

    stroke="currentColor"

    stroke-width="1.5"

    stroke-linecap="round"

    stroke-linejoin="round"

    aria-hidden="true"

  >

    <path v-for="(d, i) in paths" :key="i" :d="d" :fill="fill" />

  </svg>

</template>

