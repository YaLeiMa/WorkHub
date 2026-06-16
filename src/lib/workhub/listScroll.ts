import { nextTick } from "vue";

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

function scrollParentToBottom(scrollParent: HTMLElement) {
  const maxTop = scrollParent.scrollHeight - scrollParent.clientHeight;
  scrollParent.scrollTo({ top: Math.max(0, maxTop) });
}

/** 键盘 ↑↓ 选中项滚入可见区域；首/末项时滚到容器顶/底 */
export async function scrollListSelection(
  listEl: HTMLElement | null | undefined,
  index: number,
  topAnchor?: HTMLElement | null,
  itemCount?: number,
) {
  await nextTick();
  const lastIndex =
    itemCount != null && itemCount > 0 ? itemCount - 1 : -1;
  const scrollParent = findScrollParent(listEl ?? topAnchor ?? null);

  if (index <= 0) {
    if (scrollParent) {
      scrollParent.scrollTo({ top: 0 });
      return;
    }
    topAnchor?.scrollIntoView({ block: "start" });
    return;
  }

  if (lastIndex >= 0 && index >= lastIndex) {
    if (scrollParent) {
      scrollParentToBottom(scrollParent);
      return;
    }
    listEl
      ?.querySelector<HTMLElement>(`[data-i="${index}"]`)
      ?.scrollIntoView({ block: "end" });
    return;
  }

  listEl
    ?.querySelector<HTMLElement>(`[data-i="${index}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

/** ArrowUp：已在首项时仍滚回顶部 */
export function handleListArrowUp(
  sel: { value: number },
  listEl: HTMLElement | null | undefined,
  itemCount: number,
  topAnchor?: HTMLElement | null,
) {
  if (sel.value <= 0) {
    void scrollListSelection(listEl, 0, topAnchor, itemCount);
    return;
  }
  sel.value -= 1;
}

/** ArrowDown：已在末项时仍滚到底部 */
export function handleListArrowDown(
  sel: { value: number },
  listEl: HTMLElement | null | undefined,
  itemCount: number,
  topAnchor?: HTMLElement | null,
) {
  const last = Math.max(0, itemCount - 1);
  if (sel.value >= last) {
    void scrollListSelection(listEl, last, topAnchor, itemCount);
    return;
  }
  sel.value += 1;
}
