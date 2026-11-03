import type { DateString } from '../../core/time/kst';
import type { CalendarPost, YearMonth } from './recordModels';

const NOT_IMPLEMENTED = 'not implemented';

/** 저장용 달력 이미지의 한 날짜 칸. */
export interface CalendarImageCell {
  day: number;
  date: DateString;
  /** 사진이 있는 날의 썸네일 URL, 없으면 null. */
  thumbnailUrl: string | null;
  /** PENDING 사진(배지는 이미지에 넣지 않는 임시안이지만 모양은 알린다). */
  pending: boolean;
}

/**
 * 저장용 달력 이미지에 담길 내용(렌더 방식과 무관한 모델, REQ-REC-037, 카탈로그 쟁점 4).
 * 연월 제목, 요일 머리글(일월화수목금토), 날짜 칸(앞뒤 빈 칸은 null, cells.length는 7의 배수), 사진이 있는 날의 썸네일.
 */
export interface CalendarImageModel {
  year: number;
  month: number;
  /** "2026년 10월". */
  title: string;
  /** ['일','월','화','수','목','금','토']. */
  weekdays: string[];
  cells: (CalendarImageCell | null)[];
}

/** 현재 달의 응답으로 이미지 모델을 만든다(사진이 없는 달도 만든다). */
export function buildCalendarImageModel(_ym: YearMonth, _posts: readonly CalendarPost[]): CalendarImageModel {
  throw new Error(NOT_IMPLEMENTED);
}

/** PNG 시그니처(89 50 4E 47 0D 0A 1A 0A)와 IHDR의 가로세로를 읽는다. PNG가 아니거나 잘렸으면 null. */
export function readPngSize(_blob: Blob): Promise<{ width: number; height: number } | null> {
  throw new Error(NOT_IMPLEMENTED);
}
