import type { DateString } from '../../core/time/kst';

export interface HomeDates {
  today: DateString;
  yesterday: DateString;
  /** 일요일부터 토요일까지 7일. */
  week: DateString[];
  /** 주가 걸친 달(오름차순, 중복 없음). /posts/calendar를 달마다 부른다. */
  months: { year: number; month: number }[];
}

/** KST 오늘(yyyy-MM-dd)에서 홈이 쓰는 날짜를 모두 계산한다(REQ-HOME-003, 019, 020). kst.ts의 weekOf 등을 재사용한다. */
export function computeHomeDates(_today: DateString): HomeDates {
  throw new Error('not implemented');
}

/** 머리글 날짜 "10월 27일"(0 채움 없음). t('home.topic.header', { 'M월 d일': ... })에 넣는다. */
export function formatTopicHeaderDate(_date: DateString): string {
  throw new Error('not implemented');
}
