import type { Clock } from './Clock';
import { KstDate } from './KstDate';

// KST(Asia/Seoul) 날짜·시각 유틸. 순수 함수이며 시스템 시계·기기 시간대·로캘을 쓰지 않는다.
// 모두 구현 예정(스텁).

export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/** 요일 머리글. 일요일부터 토요일(REQ-TIME-005). */
export const WEEKDAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 같은 순간의 KST 달력 날짜. */
export function toKstDate(_instant: Date): KstDate {
  throw new Error('not implemented');
}

export function todayKst(_clock: Clock): KstDate {
  throw new Error('not implemented');
}

export function currentMonthKst(_clock: Clock): YearMonth {
  throw new Error('not implemented');
}

export function yearMonthOf(_date: KstDate): YearMonth {
  throw new Error('not implemented');
}

/** `yyyy-MM` */
export function formatYearMonth(_ym: YearMonth): string {
  throw new Error('not implemented');
}

export function daysInMonth(_year: number, _month: number): number {
  throw new Error('not implemented');
}

/** 소수 초 유무·자릿수(3/6/9)와 `Z`/`±hh:mm` 오프셋을 모두 받는다. 파싱 불가면 null. */
export function parseInstant(_text: string): Date | null {
  throw new Error('not implemented');
}

/** 날짜가 속한 주의 7일(일요일 시작). */
export function weekOf(_date: KstDate): KstDate[] {
  throw new Error('not implemented');
}

/** 날짜들이 걸친 연월(중복 없음, 오름차순). */
export function monthsSpanned(_dates: readonly KstDate[]): YearMonth[] {
  throw new Error('not implemented');
}

/** 같은 일(day)을 유지하며 지정한 연월로 옮기고, 그 달에 없는 일이면 말일로 보정한다. */
export function moveToMonth(_date: KstDate, _target: YearMonth): KstDate {
  throw new Error('not implemented');
}

export function isBeforeFirstTopicDate(_date: KstDate): boolean {
  throw new Error('not implemented');
}

/** FIRST_TOPIC_DATE보다 이르면 FIRST_TOPIC_DATE, 아니면 그대로. */
export function clampToFirstTopicDate(_date: KstDate): KstDate {
  throw new Error('not implemented');
}

/** 주어진 KST 날짜가 시계 기준 KST 오늘인가(제목 수정 버튼 판정 등). */
export function isToday(_date: KstDate, _clock: Clock): boolean {
  throw new Error('not implemented');
}

/** 서버 월 목록(최신순)에 현재 달이 없으면 넣는다. 중복 없이 최신순을 유지한다(D-19). */
export function withCurrentMonth(_months: readonly YearMonth[], _current: YearMonth): YearMonth[] {
  throw new Error('not implemented');
}

/** 알림 시각: `M월 d일 HH:mm` (KST, 24시간제, 연도 없음, 월·일 0 패딩 없음, 시·분은 2자리) */
export function formatNotificationTime(_instant: Date): string {
  throw new Error('not implemented');
}

/** `M월 d일의 주제` */
export function formatTopicDateLabel(_date: KstDate): string {
  throw new Error('not implemented');
}

/** `M월 d일 · 오늘의 주제` */
export function formatTodayTopicLabel(_date: KstDate): string {
  throw new Error('not implemented');
}

/** `chalkak-calendar-yyyy-MM.png` */
export function calendarImageFileName(_ym: YearMonth): string {
  throw new Error('not implemented');
}
