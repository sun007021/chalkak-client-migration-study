import type { KstDate } from '../../core/time/KstDate';
import type { CalendarEntry, PostSummary } from '../../data/post/PostModels';
import type { Topic } from '../../data/topic/Topic';

/** 오늘 주제 머리글. topic이 null이면 주제가 아직 없다(404): "오늘의 주제가 아직 준비되지 않았어요". */
export type TopicSection =
  { status: 'loading' } | { status: 'ready'; topic: Topic | null } | { status: 'error' };

/** D-06 히어로 7상태. Empty의 제목 문구는 화면이 TopicSection의 제목(없으면 "오늘의 주제")으로 채운다. */
export type HeroState =
  | { kind: 'loading' }
  | { kind: 'no-open-topic' }
  /** banned=true는 /posts/today 403: 모양은 같고 업로드 진입 시 정지 안내(D-08). */
  | { kind: 'empty'; banned: boolean }
  | { kind: 'processing' }
  /** thumbnailUrl은 이번 주 기록(캘린더)의 같은 postId에서만 얻는다. 없으면 null(대체 이미지). */
  | { kind: 'photo'; postId: string; pending: boolean; thumbnailUrl: string | null }
  | { kind: 'error' };

export type WeekDay = { date: KstDate; entry: CalendarEntry | null };

/** days는 일요일부터 7칸, count는 기록이 있는 칸 수("N/7"). */
export type WeeklySection =
  | { status: 'loading' }
  | { status: 'ready'; days: readonly WeekDay[]; count: number }
  | { status: 'error' };

/** posts는 서버 순서 앞 5개까지. 비어 있으면 "아직 올라온 사진이 없어요". */
export type RankingSection =
  { status: 'loading' } | { status: 'ready'; posts: readonly PostSummary[] } | { status: 'error' };

/** 어제 랭킹(yesterday)과 오늘 인기(popular). */
export type RankingKey = 'yesterday' | 'popular';

export type HomeState = {
  /** 마지막으로 불러온(또는 불러올) KST 오늘. 이 날짜가 바뀌면 전체를 새 날짜로 다시 불러온다(REQ-HOME-041). */
  todayDate: KstDate;
  yesterdayDate: KstDate;
  topic: TopicSection;
  hero: HeroState;
  weekly: WeeklySection;
  yesterday: RankingSection;
  popular: RankingSection;
  /** AI 피드백 카드를 보일 게시물(히어로 APPROVED + 주제 날짜가 KST 오늘). 없으면 null. */
  aiCardPostId: string | null;
  hasUnread: boolean;
  /** 당겨서 새로고침 인디케이터. 조용한 갱신(복귀)에서는 false. */
  refreshing: boolean;
  /** 푸시로 홈이 열릴 때마다 1씩 늘어난다. 화면이 맨 위로 스크롤한다(REQ-HOME-044). */
  scrollToTopToken: number;
};
