# WorkHub 组件库（V1）

依据《WorkHub UI 设计规范》§5 实现。所有组件仅使用 `style.css` 中注册的设计 token，文案全中文，键盘交互遵守规范 §8。

## WhIcon.vue

统一线性图标（描边 1.5px，viewBox 24）。

| Prop | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| `name` | `IconName` | 是 | — | 图标名：`search/home/project/snippet/star/settings/link/command/file/folder/doc/plus/close/copy` |
| `size` | `number` | 否 | `20` | 像素尺寸 |
| `filled` | `boolean` | 否 | `false` | 仅 `star` 支持填充态（收藏） |

> `ItemKind`（project/snippet/link/command/file/folder/doc）是 `IconName` 子集，可直接作为 `name` 传入。

## Button.vue

| Prop | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `variant` | `primary/secondary/danger/text/icon` | `secondary` | 按钮类型（规范 §5.10） |
| `disabled` | `boolean` | `false` | 禁用态（透明度 0.5 + 禁止指针） |
| `type` | `button/submit` | `button` | 原生类型 |
| `ariaLabel` | `string` | — | 无障碍标签（图标按钮必填） |

插槽：默认插槽为按钮内容。

## SearchBox.vue

高 40px 搜索框，左置放大镜，输入后右侧出现清除按钮。

| Prop | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `modelValue` | `string` | — | `v-model` 双向绑定值 |
| `placeholder` | `string` | `搜索项目、文件、代码片段、收藏…` | 占位文案 |
| `autofocus` | `boolean` | `false` | 挂载后自动聚焦 |

Emits：`update:modelValue`。
Expose：`focus()`（供 `Ctrl+Shift+K` 调用，聚焦并全选）。
快捷键：`Esc` 在有内容时清空（已空则交还上层）。

## ResultItem.vue

列表项：`[类型图标] 标题(命中高亮) · 标签 · 相对时间 [收藏]`。

| Prop | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `kind` | `ItemKind` | — | 决定左侧类型图标 |
| `title` | `string` | — | 主标题 |
| `highlight` | `string` | — | 命中关键词，自动高亮标题中片段 |
| `subtitle` | `string` | — | 次要描述（单行省略） |
| `tags` | `string[]` | — | 标签（最多显示 3 个，超出 `+N`） |
| `meta` | `string` | — | 右侧元信息（相对时间） |
| `selected` | `boolean` | `false` | 键盘选中态（`surface-active` + 左侧主色条） |
| `favorite` | `boolean` | `false` | 收藏态 |
| `showFavorite` | `boolean` | `false` | 是否显示收藏按钮 |

Emits：`select`（单击/键盘选中）、`activate`（双击/Enter 主操作）、`toggleFavorite`。

## EmptyState.vue

居中空状态：弱化图标 + 标题 + 描述 + 可选操作。

| Prop | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `title` | `string` | 是 | 主文案 |
| `description` | `string` | 否 | 辅助说明 |

插槽：`#icon`（自定义图标）、`#action`（底部操作按钮）。

## Toaster.vue

全局 Toast 容器，锚定底部状态栏上方居中，2.5s 自动消失。数据来自 `lib/workhub/toast`（`toast.success/info/error`），无需 Props。

## Modal.vue（FormModal 表单弹窗）

容器 `radius-xl` + `shadow-pop`，半透明遮罩，点击遮罩关闭。

| Prop | 类型 | 默认 | 含义 |
| --- | --- | --- | --- |
| `open` | `boolean` | — | 是否显示 |
| `title` | `string` | — | 标题 |
| `submitText` | `string` | `保存` | 主按钮文案 |
| `cancelText` | `string` | `取消` | 次按钮文案 |
| `submitVariant` | `primary/danger` | `primary` | 主按钮类型 |
| `width` | `number` | `480` | 宽度(px) |
| `showFooter` | `boolean` | `true` | 是否显示底部操作区 |

Emits：`close`、`submit`。插槽：默认插槽为表单内容。
快捷键：`Esc` 关闭、`Ctrl+Enter` 提交。

## ConfirmDialog.vue

基于 Modal 的二次确认弹窗（删除/导入/恢复等危险操作）。
Props：`open`、`title`、`description`、`confirmText`、`cancelText`、`danger`(默认 true，主按钮 danger 色)。
Emits：`confirm`、`cancel`。

## Field.vue

表单字段容器：label（顶对齐）+ 必填星标 + 错误/提示。
Props：`label`、`required`、`error`、`hint`。插槽：默认插槽为控件。

## WhInput.vue / WhTextarea.vue

统一样式的输入框 / 多行输入，`v-model` 双向绑定。
Props：`modelValue`、`placeholder`、（WhInput 额外 `autofocus`）。Emits：`update:modelValue`。

## TagInput.vue

标签输入：回车添加（单标签 ≤ 20 字、去重），空输入退格删除末尾，chip 可点 × 删除。
Props：`modelValue: string[]`、`placeholder`。Emits：`update:modelValue`。

## WhSelect.vue

下拉选择，`v-model` 双向绑定，选项通过默认插槽传入 `<option>`。
Props：`modelValue`。Emits：`update:modelValue`。

## CodeViewer.vue

只读代码查看：等宽字体 + 行号 + 右上角复制按钮（复制后 Toast「代码已复制」）。
Props：`code`、`language?`、`successText?`(默认「代码已复制」)。

## ResultItem 补充

新增 `badge?: string`：标题后的分类徽标（主色弱底），用于片段分类展示。

## WhTextarea 补充

新增 `mono?: boolean`：开启等宽字体 + 更高最小高度，用于代码内容输入。

## Card.vue

详情页卡片：左侧图标 + 标题，右上角可选文本操作。
Props：`title`、`action?`。Emits：`action`。插槽：默认插槽为卡片内容。

## Shell.vue

应用外壳：TopBar(56) + 左侧导航(64) + 主区(唯一滚动) + StatusBar(32)。
负责全局快捷键：`Ctrl+1~5` 切模块、`Ctrl+,` 设置、`Ctrl+Shift+K` 聚焦搜索。
当前主区按 `lib/workhub/nav` 的 `currentPath` 切换页面（首页已实现，其余为「建设中」占位）。
