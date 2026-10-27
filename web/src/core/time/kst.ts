/** 모든 날짜는 기기 시간대와 무관하게 Asia/Seoul(UTC+9, 서머타임 없음). 날짜 문자열은 그레고리력 ASCII yyyy-MM-dd. */
import type { Clock } from './Clock';

export type DateString = string; // yyyy-MM-dd

/** epoch ms → KST 날짜. */
export function kstDateOf(_epochMs: number): DateString {
  throw new Error('not implemented');
}

export function kstToday(_clock: Clock): DateString {
  throw new Error('not implemented');
}

/** 날짜 문자열 비교용. 형식 오류면 throw. */
export function parseDateString(_s: string): { year: number; month: number; day: number } {
  throw new Error('not implemented');
}

export function formatDateString(_year: number, _month: number, _day: number): DateString {
  throw new Error('not implemented');
}

/** KST 해당 날짜 00:00:00의 epoch ms. */
export function kstStartOfDay(_date: DateString): number {
  throw new Error('not implemented');
}

/** 다음 KST 자정(now 이후 첫 00:00:00)의 epoch ms. now가 정확히 자정이면 그다음 자정. */
export function nextKstMidnight(_epochMs: number): number {
  throw new Error('not implemented');
}

/** 일요일 시작 주(일~토)의 7개 날짜와 걸친 월('yyyy-MM', 중복 없이 오름차순). */
export function weekOf(_date: DateString): { days: DateString[]; months: string[] } {
  throw new Error('not implemented');
}

/** year-month에서 day를 말일로 보정(31일→30일 달, 2027-02-29→02-28, 2028-02-29 유효). */
export function clampDayToMonth(_year: number, _month: number, _day: number): DateString {
  throw new Error('not implemented');
}

/** 전시 날짜 이동 하한(FIRST_TOPIC_DATE)과 상한(오늘) 안인가. 양 끝 포함. */
export function isSelectableTopicDate(_date: DateString, _today: DateString): boolean {
  throw new Error('not implemented');
}

/** 주제 날짜가 KST 오늘인가(제목 수정 버튼 판정). */
export function isTodayKst(_date: DateString, _clock: Clock): boolean {
  throw new Error('not implemented');
}
