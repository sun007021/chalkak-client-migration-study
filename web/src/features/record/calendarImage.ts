import { t } from '../../copy/ko';
import { formatDateString } from '../../core/time/kst';
import type { DateString } from '../../core/time/kst';
import type { CalendarPost, YearMonth } from './recordModels';
import { monthGrid, monthLabel } from './recordMonths';

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
export function buildCalendarImageModel(ym: YearMonth, posts: readonly CalendarPost[]): CalendarImageModel {
  const byDate = new Map(posts.map((post) => [post.topicDate, post]));
  const cells = monthGrid(ym).cells.map((day): CalendarImageCell | null => {
    if (day === null) return null;
    const date = formatDateString(ym.year, ym.month, day);
    const post = byDate.get(date);
    return { day, date, thumbnailUrl: post?.thumbnailImageUrl ?? null, pending: post?.status === 'PENDING' };
  });
  return { year: ym.year, month: ym.month, title: monthLabel(ym), weekdays: Array.from(t('record.weekday')), cells };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52];
/** 시그니처 8 + 청크 길이 4 + 'IHDR' 4 + 가로 4 + 세로 4. */
const HEADER_LENGTH = 24;

/** PNG 시그니처(89 50 4E 47 0D 0A 1A 0A)와 IHDR의 가로세로를 읽는다. PNG가 아니거나 잘렸으면 null. */
export async function readPngSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  const bytes = new Uint8Array(await blob.slice(0, HEADER_LENGTH).arrayBuffer());
  if (bytes.length < HEADER_LENGTH) return null;
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) || !IHDR.every((byte, index) => bytes[12 + index] === byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
