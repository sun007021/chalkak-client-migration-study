/** 요청 취소(AbortController)를 알리는 표준 오류. */
export function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/** signal이 이미 abort되었으면 AbortError를 던진다. */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}
