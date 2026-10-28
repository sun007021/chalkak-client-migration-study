import type { NavigatorScreenParams } from '@react-navigation/native';

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
  };
  Notifications: undefined;
  IssueWeb: { url: string };
  Upload: undefined;
};
