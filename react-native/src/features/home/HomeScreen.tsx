import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
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
import { useGlassBarInset } from '../../shared/glass/glass';
import { t } from '../../shared/copy';
import { colors, spacing } from '../../shared/design/tokens';
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
  const barInset = useGlassBarInset();
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
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + barInset }]}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            tintColor={colors.actionPrimary}
            colors={[colors.actionPrimary]}
            progressBackgroundColor={colors.surfaceElevated}
            onRefresh={() => void viewModel.refresh()}
          />
        }
      >
        {/* 당겨서 새로고침 표시는 RefreshControl(네이티브)이 그린다. 이 요소는 갱신 중임을 알리는 자리표시자다. */}
        {state.refreshing ? <View testID="home.refresh-indicator" /> : null}
        <View style={styles.topic}>
          <TopicHeader topic={state.topic} onRetry={() => void viewModel.retryTopic()} />
        </View>
        <View style={styles.hero}>
          <HeroCard
            hero={state.hero}
            topicTitle={topicTitle}
            onPress={() => viewModel.onHeroPress()}
            onRetry={() => void viewModel.retryHero()}
          />
        </View>
        {state.aiCardPostId !== null ? (
          <View testID="home.ai-card" style={styles.aiCard}>
            {renderAiCard?.(state.aiCardPostId, state.todayDate)}
          </View>
        ) : null}
        <View style={state.aiCardPostId !== null ? styles.afterAi : styles.section}>
          <WeeklySection
            weekly={state.weekly}
            onDayPress={(date) => viewModel.onWeekDayPress(date)}
            onMorePress={() => viewModel.onWeeklyMorePress()}
            onRetry={() => void viewModel.retryWeekly()}
          />
        </View>
        {(['yesterday', 'popular'] as const).map((key) => (
          <View key={key} style={styles.section}>
            <RankingRow
              rankingKey={key}
              title={t(key === 'yesterday' ? 'home.ranking.yesterday' : 'home.ranking.today')}
              section={state[key]}
              onItemPress={(postId) => viewModel.onRankingItemPress(key, postId)}
              onLikePress={(postId) => viewModel.onRankingLikePress(key, postId)}
              onMorePress={() => viewModel.onRankingMorePress(key)}
              onRetry={() => void viewModel.retryRanking(key)}
            />
          </View>
        ))}
        <View style={styles.section}>
          <IssueSection
            feed={feed}
            onBannerPress={(id) => viewModel.onBannerPress(id)}
            onRetry={() => void viewModel.retryBanners()}
            onSectionLayout={issue.onSectionLayout}
            onCardLayout={issue.onCardLayout}
          />
        </View>
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

// 섹션 사이 간격은 원본 홈(screens-a.md §7.1): 주제 위 xl+sm, 히어로 위 xl, 피드백 카드 위 lg, 나머지 섹션 위 xxl.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  topic: { marginTop: spacing.xl + spacing.sm },
  hero: { marginTop: spacing.xl },
  aiCard: { marginTop: spacing.lg },
  afterAi: { marginTop: spacing.xl },
  section: { marginTop: spacing.xxl },
});
