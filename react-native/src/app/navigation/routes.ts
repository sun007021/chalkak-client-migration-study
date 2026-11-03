import type { NavigatorScreenParams } from '@react-navigation/native';

import type { TodayModerationStatus } from '../../data/post/PostModels';
import type { FeedEntry, FeedSeed } from '../../features/feed/FeedTarget';

/** 하단 탭 4개의 이름. 순서가 하단 바의 왼쪽부터의 순서다(업로드 버튼은 두 번째와 세 번째 사이, 탭이 아님). */
export const TAB_ROUTES = ['Home', 'Display', 'Record', 'Settings'] as const;
export type TabRouteName = (typeof TAB_ROUTES)[number];

export type TabParamList = {
  Home: undefined;
  /** 홈 랭킹 더보기에서 오면 날짜(yyyy-MM-dd)와 인기순이 따라온다. 전시 PR이 해석한다. */
  Display: { date?: string; sort?: 'popular' } | undefined;
  /** 홈 주간 기록에서 오면 선택 날짜(yyyy-MM-dd) 또는 null. 기록 PR이 해석한다. */
  Record: { selectedDate?: string | null } | undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** seed: 전시·홈 랭킹에서 열 때 목록 항목(직렬화 가능한 복사본). entry/thumbnailUrl: 기록·푸시 진입. */
  PostDetail: {
    postId: string;
    seed?: FeedSeed | null;
    entry?: FeedEntry;
    thumbnailUrl?: string | null;
    /** 푸시 AI 리뷰 탭: 상세를 열며 AI 피드백 시트를 한 번 자동으로 연다(D-11). AI 리뷰 PR이 해석한다. */
    openAiSheet?: boolean;
  };
  Notifications: undefined;
  NotificationDetail: { notificationId: string };
  IssueWeb: { url: string };
  /** 게이트가 고정해 넘긴 주제 날짜(yyyy-MM-dd, REQ-UPL-008). */
  Upload: { topicDate: string };
  /** 업로드 화면을 바꿔 올라온다(뒤로 가도 업로드 화면이 없다, REQ-UPL-064). */
  UploadSuccess: { topicTitle: string; topicDate: string; moderationStatus: TodayModerationStatus };
  /** 설정의 "피드백 보내기"(회원만). 작성 중에는 푸시 탭 이동을 미룬다(REQ-FDBK-014). */
  Feedback: undefined;
  /** 설정의 사인 변경 흐름(그리기 -> 미리보기). */
  SignatureChange: undefined;
};

export const FEEDBACK_ROUTE_NAME = 'Feedback' as const satisfies keyof RootStackParamList;
export const SIGNATURE_CHANGE_ROUTE_NAME =
  'SignatureChange' as const satisfies keyof RootStackParamList;

/**
 * 작성 중 내용을 보호하려고 푸시 탭 이동을 미루는 화면(REQ-PUSH-031).
 */
export const PUSH_TAP_BLOCKING_ROUTES: readonly (keyof RootStackParamList)[] = [
  'Upload',
  FEEDBACK_ROUTE_NAME,
];
