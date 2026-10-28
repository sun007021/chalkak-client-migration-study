import { FIRST_TOPIC_DATE } from '../../shared/constants';
import { KstDate } from './KstDate';

// 최초 전시일(REQ-TIME-008)은 모듈 로드 시 한 번만 파싱한다. 상수가 잘못되면 앱 시작 때 바로 드러난다.
const parsed = KstDate.parse(FIRST_TOPIC_DATE);
if (!parsed) throw new Error(`invalid FIRST_TOPIC_DATE: ${FIRST_TOPIC_DATE}`);
const FIRST_DATE: KstDate = parsed;

/** 최초 전시일(D-12)을 KstDate로. */
export const FIRST_TOPIC_KST_DATE: KstDate = FIRST_DATE;

export function isBeforeFirstTopicDate(date: KstDate): boolean {
  return date.compare(FIRST_DATE) < 0;
}

/** FIRST_TOPIC_DATE보다 이르면 FIRST_TOPIC_DATE, 아니면 그대로. */
export function clampToFirstTopicDate(date: KstDate): KstDate {
  return isBeforeFirstTopicDate(date) ? FIRST_DATE : date;
}
