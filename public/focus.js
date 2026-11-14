export function rememberFocus(documentRoot = document) {
  const node = documentRoot.activeElement;
  if (!node || node === documentRoot.body) return null;
  let selector;
  if (node.id) selector = `#${CSS.escape(node.id)}`;
  else if (node.dataset.action !== undefined)
    selector = `[data-action="${CSS.escape(node.dataset.action)}"]`;
  else if (node.dataset.check !== undefined)
    selector = `[data-check="${CSS.escape(node.dataset.check)}"]`;
  else if (node.dataset.tab !== undefined)
    selector = `[data-tab="${CSS.escape(node.dataset.tab)}"]`;
  if (!selector) return { node, selector: null, index: 0 };
  return {
    node,
    selector,
    index: [...documentRoot.querySelectorAll(selector)].indexOf(node),
  };
}
export function restoreFocus(snapshot, documentRoot = document) {
  if (!snapshot || snapshot.node.isConnected) return;
  const choices = snapshot.selector
    ? [...documentRoot.querySelectorAll(snapshot.selector)]
    : [];
  const candidate = choices[snapshot.index] || choices[0];
  const target =
    candidate && !candidate.disabled
      ? candidate
      : documentRoot.querySelector("#main");
  if (target && !target.disabled) target.focus({ preventScroll: true });
}
