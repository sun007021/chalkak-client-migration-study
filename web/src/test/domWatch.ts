/** document.body에 data-testid 요소가 한 번이라도 추가됐는지 기록한다(잠깐 그려졌다 사라지는 "번쩍임"도 잡는다). */
export function watchAdded(testId: string): { seen: () => boolean; stop: () => void } {
  let seen = document.querySelector(`[data-testid="${testId}"]`) !== null;
  const matches = (node: Node): boolean =>
    node instanceof Element && (node.getAttribute('data-testid') === testId || node.querySelector(`[data-testid="${testId}"]`) !== null);
  const observer = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach((node) => void (seen ||= matches(node)));
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { seen: () => seen, stop: () => observer.disconnect() };
}
