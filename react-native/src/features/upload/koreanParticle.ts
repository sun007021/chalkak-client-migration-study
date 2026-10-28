import { format, t } from '../../shared/copy';

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** 받침이 있는 한글 음절로 끝나면 "을", 받침이 없거나 한글이 아니거나 비어 있으면 "를". 끝의 공백은 무시한다. */
export function objectParticle(word: string): '을' | '를' {
  const trimmed = word.trimEnd();
  if (trimmed === '') return '를';
  const last = Array.from(trimmed).pop() as string;
  const code = last.codePointAt(0) as number;
  if (code < HANGUL_START || code > HANGUL_END) return '를';
  return (code - HANGUL_START) % 28 === 0 ? '를' : '을';
}

/** 성공 화면 문장: "‘{주제}’을/를 기록했어요."(조사 선택). */
export function recordedMessage(topicTitle: string): string {
  return format(t('upload.success.title'), {
    주제: topicTitle,
    '을/를': objectParticle(topicTitle),
  });
}
