/** vue-i18n 会解析 { @ } 等语法；含字面量大括号/符号的文案用函数包一层 */
export function literalMsg(text: string) {
  return () => text;
}
