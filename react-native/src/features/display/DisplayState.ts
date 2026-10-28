import type { KstDate } from '../../core/time/KstDate';
import type { PostSort, PostSummary } from '../../data/post/PostModels';
import type { Topic } from '../../data/topic/Topic';

/** 아카이브 추천 카드 수(REQ-DISP-018). */
export const FEATURED_COUNT = 5;
/** 끝에서 이 개수 이내(마지막 3개)에 닿으면 다음 페이지(REQ-DISP-025). */
export const END_THRESHOLD = 2;

export type DisplayStatus = 'loading' | 'content' | 'empty' | 'error';

export type DisplayState = {
  /** 선택한 날짜(전시 중인 날짜). 이동 실패 때는 직전 성공 날짜로 복원된다. */
  date: KstDate;
  /** 상한(KST 오늘). 화면이 다시 보일 때 갱신된다(REQ-DISP-015). */
  today: KstDate;
  /** 하한(FIRST_TOPIC_DATE). */
  minDate: KstDate;
  /** date === today이면 latest(정렬 탭 있음), 아니면 archive(popular 고정). */
  mode: 'latest' | 'archive';
  /** 지금 목록에 적용된 정렬. archive에서는 항상 popular. */
  sort: PostSort;
  /** 오늘 모드에서 사용자가 고른 정렬. archive에서 돌아오면 복원한다. */
  preferredSort: PostSort;
  topic: Topic | null;
  status: DisplayStatus;
  /** status가 error일 때: 연결 실패면 'network'(문구 common.error.network), 아니면 'generic'(display.error). */
  errorKind: 'network' | 'generic' | null;
  photos: readonly PostSummary[];
  /** archive의 인기 상위 5장. photos에도 들어 있다. */
  featured: readonly PostSummary[];
  featuredPage: number;
  hasNext: boolean;
  /** 정렬 변경·탭 재선택·복귀 재검증 중(기존 사진은 유지). */
  refreshing: boolean;
  paging: boolean;
  /** 첫 로딩 중에는 날짜 이동을 막는다(REQ-DISP-011). */
  navigationLocked: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  /** 탭 재선택 때 1씩 늘어난다. 화면이 맨 위로 스크롤한다. */
  scrollToTopToken: number;
};
