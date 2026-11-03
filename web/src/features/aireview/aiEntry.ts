/** 홈 "자세히 보기"가 상세를 열 때 넣는 location.state `{ openAiReview: true }`를 읽는다. 믿을 수 있는 값은 정확히 true뿐이다. */
export function readOpenAiReview(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { openAiReview?: unknown }).openAiReview === true;
}
