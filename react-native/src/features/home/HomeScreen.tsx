import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { KstDate } from '../../core/time/KstDate';
import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import { colors } from '../../shared/ui/theme';
import { HeroCard } from './ui/HeroCard';
import { IssueSection } from './ui/IssueSection';
import { RankingRow } from './ui/RankingRow';
import { TopBar } from './ui/TopBar';
import { TopicHeader } from './ui/TopicHeader';
import { WeeklySection } from './ui/WeeklySection';
import type { HomeViewModel } from './HomeViewModel';

export type HomeScreenProps = {
  viewModel: HomeViewModel;
  /** AI 피드백 카드 본문. AI 리뷰 PR이 채운다. 홈은 `home.ai-card` 자리만 만든다. */
  /** topicDate는 카드를 보이는 조건이 되는 오늘(KST) 주제 날짜다. */
  renderAiCard?: (postId: string, topicDate: KstDate) => ReactNode;
};

/**
 * testID는 docs/testing/testids.md의 home.* 그대로. 마운트 시 viewModel.onShown(), 언마운트 시 onHidden()을 부른다.
 * 상태는 useViewModelState로 구독만 하고 분기 로직을 갖지 않는다. ViewModel을 만들고 버리는 것은 소유자다(dispose 금지).
 */
export function HomeScreen({ viewModel, renderAiCard }: HomeScreenProps) {
  const state = useViewModelState(viewModel);
  const feed = useViewModelState(viewModel.bannerFeed);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const issue = useIssuePrefetch(viewModel);
  const { report: reportVisibleCards } = issue;
  // 목록이 바뀌면(새로고침·추가 페이지) 스크롤 없이도 보이는 마지막 카드를 다시 알린다.
  // 실패로 loadingMore만 바뀌는 경우에는 banners 참조가 그대로라 재시도가 스스로 반복되지 않는다.
  const banners = feed.status === 'ready' ? feed.banners : null;
  useEffect(() => {
    reportVisibleCards();
  }, [banners, reportVisibleCards]);

  useEffect(() => {
    void viewModel.onShown();
    return () => viewModel.onHidden();
  }, [viewModel]);

  useEffect(() => {
    if (state.scrollToTopToken > 0) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [state.scrollToTopToken]);

  const topicTitle =
    state.topic.status === 'ready' && state.topic.topic ? state.topic.topic.title : null;

  return (
    <View testID="home.root" style={[styles.root, { paddingTop: insets.top }]}>
      <TopBar
        hasUnread={state.hasUnread}
        onNotificationPress={() => viewModel.onNotificationPress()}
      />
      <ScrollView
        ref={scrollRef}
        testID="home.scroll"
        onLayout={issue.onScrollLayout}
        onScroll={issue.onScroll}
        scrollEventThrottle={100}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={() => void viewModel.refresh()}
          />
        }
      >
        {state.refreshing ? (
          <ActivityIndicator testID="home.refresh-indicator" style={styles.indicator} />
        ) : null}
        <TopicHeader topic={state.topic} onRetry={() => void viewModel.retryTopic()} />
        <HeroCard
          hero={state.hero}
          topicTitle={topicTitle}
          onPress={() => viewModel.onHeroPress()}
          onRetry={() => void viewModel.retryHero()}
        />
        {state.aiCardPostId !== null ? (
          <View testID="home.ai-card">{renderAiCard?.(state.aiCardPostId, state.todayDate)}</View>
        ) : null}
        <WeeklySection
          weekly={state.weekly}
          onDayPress={(date) => viewModel.onWeekDayPress(date)}
          onMorePress={() => viewModel.onWeeklyMorePress()}
          onRetry={() => void viewModel.retryWeekly()}
        />
        {(['yesterday', 'popular'] as const).map((key) => (
          <RankingRow
            key={key}
            rankingKey={key}
            title={t(key === 'yesterday' ? 'home.ranking.yesterday' : 'home.ranking.today')}
            section={state[key]}
            onItemPress={(postId) => viewModel.onRankingItemPress(key, postId)}
            onLikePress={(postId) => viewModel.onRankingLikePress(key, postId)}
            onMorePress={() => viewModel.onRankingMorePress(key)}
            onRetry={() => void viewModel.retryRanking(key)}
          />
        ))}
        <IssueSection
          feed={feed}
          onBannerPress={(id) => viewModel.onBannerPress(id)}
          onRetry={() => void viewModel.retryBanners()}
          onSectionLayout={issue.onSectionLayout}
          onCardLayout={issue.onCardLayout}
        />
      </ScrollView>
    </View>
  );
}

/**
 * ISSUE 카드는 세로로 쌓이므로 "화면에 보이는 마지막 카드"를 스크롤 위치와 카드 위치로 계산해 ViewModel에 알린다.
 * 스크롤·레이아웃마다 그대로 알린다. 같은 카드가 마지막이어도 건너뛰지 않는다: 중복 요청은 ViewModel이
 * `loadingMore`/`hasNext`로 막고, 다음 페이지가 실패한 뒤에는 끝에서 다시 스크롤할 때 재시도해야 한다(REQ-BANR-009/010).
 * 새로고침으로 목록이 줄면 사라진 카드의 옛 위치가 남지 않도록 현재 개수 밖의 인덱스는 버린다.
 */
function useIssuePrefetch(viewModel: HomeViewModel) {
  const sectionY = useRef(0);
  const cardYs = useRef(new Map<number, number>());
  const viewport = useRef({ top: 0, height: 0 });

  const report = useCallback(() => {
    const feed = viewModel.bannerFeed.getSnapshot();
    const count = feed.status === 'ready' ? feed.banners.length : 0;
    const bottom = viewport.current.top + viewport.current.height;
    let last = -1;
    cardYs.current.forEach((y, index) => {
      if (index >= count) cardYs.current.delete(index);
      else if (sectionY.current + y < bottom && index > last) last = index;
    });
    if (last < 0) return;
    void viewModel.bannerFeed.onLastVisibleIndexChanged(last);
  }, [viewModel]);

  return {
    report,
    onScrollLayout: (e: { nativeEvent: { layout: { height: number } } }) => {
      viewport.current.height = e.nativeEvent.layout.height;
      report();
    },
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      viewport.current.top = e.nativeEvent.contentOffset.y;
      viewport.current.height = e.nativeEvent.layoutMeasurement.height;
      report();
    },
    onSectionLayout: (y: number) => {
      sectionY.current = y;
      report();
    },
    onCardLayout: (index: number, y: number) => {
      cardYs.current.set(index, y);
      report();
    },
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  indicator: { paddingVertical: 8 },
});
