import type { KstDate } from '../../core/time/KstDate';
import { asObject, instant, kstDate, oneOf, str } from '../decode';

export type TopicPhase = 'BEFORE_OPEN' | 'OPEN' | 'CLOSED';

const PHASES: readonly TopicPhase[] = ['BEFORE_OPEN', 'OPEN', 'CLOSED'];

/** GET /topics?date= 응답. 날짜·시각은 파싱된 값 객체다(KstDate, UTC Date). */
export type Topic = {
  id: string;
  title: string;
  topicDate: KstDate;
  startsAt: Date;
  endsAt: Date;
  phase: TopicPhase;
};

/**
 * 필수 필드 누락·형식 오류·알 수 없는 phase면 throw한다(ApiClient가 InvalidResponseError로 바꾼다).
 * 알 수 없는 enum은 조용히 통과시키지 않는다(TC-NET-009, AN 규칙: 잘못된 상태 = InvalidResponse).
 */
export function decodeTopic(raw: unknown): Topic {
  const o = asObject(raw, 'topic');
  return {
    id: str(o, 'id'),
    title: str(o, 'title'),
    topicDate: kstDate(o, 'topicDate'),
    startsAt: instant(o, 'startsAt'),
    endsAt: instant(o, 'endsAt'),
    phase: oneOf(o, 'phase', PHASES),
  };
}
