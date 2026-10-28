/** 받침이 있는 한글 음절로 끝나면 "을", 받침이 없거나 한글이 아니거나 비어 있으면 "를". 끝의 공백은 무시한다. */
export function objectParticle(word: string): '을' | '를' {
  void word;
  throw new Error('not implemented');
}

/** 성공 화면 문장: "‘{주제}’을/를 기록했어요."(조사 선택). */
export function recordedMessage(topicTitle: string): string {
  void topicTitle;
  throw new Error('not implemented');
}
