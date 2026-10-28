import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { formatMonthDay } from '../../core/time/dateFormat';
import type { PostSort, PostSummary } from '../../data/post/PostModels';
import { t } from '../../shared/copy';
import { colors, spacing } from '../../shared/ui/theme';
import { collapseProgress } from './displayDateRange';
import { DatePickerSheet } from './ui/DatePickerSheet';
import { FeaturedPager } from './ui/FeaturedPager';
import { PhotoTile } from './ui/PhotoTile';
import type { DisplayViewModel } from './DisplayViewModel';

/** 헤더(주제·설명)가 다 접히는 스크롤 거리와 접히기 전 높이. */
const COLLAPSE_DISTANCE = 96;
const COLLAPSIBLE_HEIGHT = 56;

const SORTS: readonly { sort: PostSort; testID: string; label: () => string }[] = [
  { sort: 'recent', testID: 'display.sort-recent-tab', label: () => t('display.sort.recent') },
  { sort: 'popular', testID: 'display.sort-popular-tab', label: () => t('display.sort.popular') },
  { sort: 'random', testID: 'display.sort-random-tab', label: () => t('display.sort.random') },
];

const GRID_IDS = {
  item: 'display.item-',
  likeButton: 'display.like-button-',
  likeCount: 'display.like-count-',
};

/**
 * 전시 탭 화면. 상태를 그리기만 하고 분기는 ViewModel이 한다. testID는 docs/testing/testids.md의 display 표를 따른다.
 * 마운트 = onShown, 언마운트 = onHidden이다(탭을 포커스일 때만 마운트하므로 복귀가 곧 "다시 보임"). ViewModel은 소유자가 만든다.
 */
export function DisplayScreen({ viewModel }: { viewModel: DisplayViewModel }) {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collapse, setCollapse] = useState(0);
  const [ratios, setRatios] = useState<Readonly<Record<string, number>>>({});
  const visible = useVisibleReport(viewModel, state.photos);

  useEffect(() => {
    void viewModel.onShown();
    return () => viewModel.onHidden();
  }, [viewModel]);

  useEffect(() => {
    if (state.scrollToTopToken > 0) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [state.scrollToTopToken]);

  const onImageLoad = useCallback((postId: string, ratio: number) => {
    setRatios((prev) => (prev[postId] === ratio ? prev : { ...prev, [postId]: ratio }));
  }, []);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setCollapse(collapseProgress(event.nativeEvent.contentOffset.y, COLLAPSE_DISTANCE));
    visible.onScroll(event);
  };

  const hasGrid = state.status === 'content';
  const half = [0, 1].map((column) => state.photos.filter((_, index) => index % 2 === column));

  return (
    <View testID="display.root" style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.dateRow}>
          <Pressable
            testID="display.prev-date-button"
            accessibilityRole="button"
            accessibilityLabel={t('display.nav.previous')}
            disabled={!state.canGoPrevious}
            onPress={() => void viewModel.goPrevious()}
            hitSlop={8}
            style={!state.canGoPrevious && styles.disabled}
          >
            <Text style={styles.arrow}>{'<'}</Text>
          </Pressable>
          <Pressable
            testID="display.date-picker-button"
            accessibilityRole="button"
            onPress={() => setPickerOpen(true)}
            hitSlop={8}
          >
            <Text testID="display.date-label" style={styles.date}>
              {formatMonthDay(state.date)}
            </Text>
          </Pressable>
          <Pressable
            testID="display.next-date-button"
            accessibilityRole="button"
            accessibilityLabel={t('display.nav.next')}
            disabled={!state.canGoNext}
            onPress={() => void viewModel.goNext()}
            hitSlop={8}
            style={!state.canGoNext && styles.disabled}
          >
            <Text style={styles.arrow}>{'>'}</Text>
          </Pressable>
        </View>
        <View
          style={{
            height: COLLAPSIBLE_HEIGHT * (1 - collapse),
            opacity: 1 - collapse,
            overflow: 'hidden',
          }}
        >
          <Text testID="display.topic-title" style={styles.topic} numberOfLines={1}>
            {state.topic?.title ?? ''}
          </Text>
          <Text testID="display.description" style={styles.description} numberOfLines={1}>
            {state.mode === 'archive'
              ? t('display.header.desc-archive')
              : t('display.header.desc-latest')}
          </Text>
        </View>
        {state.mode === 'latest' ? (
          <View style={styles.tabs}>
            {SORTS.map(({ sort, testID, label }) => (
              <Pressable
                key={sort}
                testID={testID}
                accessibilityRole="tab"
                accessibilityState={{ selected: state.sort === sort }}
                onPress={() => void viewModel.selectSort(sort)}
                style={[styles.tab, state.sort === sort && styles.tabSelected]}
              >
                <Text style={[styles.tabText, state.sort === sort && styles.tabTextSelected]}>
                  {label()}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {state.status === 'loading' ? (
        <ActivityIndicator testID="display.loading" style={styles.center} />
      ) : null}
      {state.status === 'empty' ? (
        <View style={styles.center}>
          <Text testID="display.empty-state" style={styles.message}>
            {t('display.empty')}
          </Text>
        </View>
      ) : null}
      {state.status === 'error' ? (
        <View style={styles.center}>
          <Text testID="display.error-state" style={styles.message}>
            {state.errorKind === 'network' ? t('common.error.network') : t('display.error')}
          </Text>
          <Pressable
            testID="display.retry-button"
            accessibilityRole="button"
            onPress={() => void viewModel.retry()}
            style={styles.retry}
          >
            <Text style={styles.retryText}>{t('display.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {hasGrid ? (
        <ScrollView
          ref={scrollRef}
          testID="display.grid"
          onLayout={visible.onViewportLayout}
          onScroll={onScroll}
          scrollEventThrottle={50}
        >
          {state.refreshing ? (
            <ActivityIndicator testID="display.refresh-indicator" style={styles.indicator} />
          ) : null}
          {state.mode === 'archive' && state.featured.length > 0 ? (
            <FeaturedPager
              posts={state.featured}
              page={state.featuredPage}
              ratios={ratios}
              onPageChanged={(page) => viewModel.onFeaturedPageChanged(page)}
              onPress={(postId) => viewModel.onPhotoPress(postId)}
              onLikePress={(postId) => viewModel.onLikePress(postId)}
              onImageLoad={onImageLoad}
            />
          ) : null}
          <View style={styles.columns} onLayout={visible.onColumnsLayout}>
            {half.map((posts, column) => (
              <View key={column} style={styles.column}>
                {posts.map((post) => (
                  <PhotoTile
                    key={post.id}
                    post={post}
                    ids={GRID_IDS}
                    ratio={ratios[post.id] ?? 1}
                    onPress={() => viewModel.onPhotoPress(post.id)}
                    onLikePress={() => viewModel.onLikePress(post.id)}
                    onImageLoad={(ratio) => onImageLoad(post.id, ratio)}
                    onLayout={visible.tileLayout(post.id)}
                  />
                ))}
              </View>
            ))}
          </View>
          {state.paging ? (
            <ActivityIndicator testID="display.load-more-indicator" style={styles.indicator} />
          ) : null}
        </ScrollView>
      ) : null}

      {pickerOpen ? (
        <DatePickerSheet
          range={{ min: state.minDate, max: state.today }}
          initial={state.date}
          onClose={() => setPickerOpen(false)}
          onConfirm={(date) => {
            setPickerOpen(false);
            void viewModel.pickDate(date);
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * "보이는 마지막 사진"을 스크롤 위치와 사진 위치로 계산해 ViewModel에 알린다(끝에서 세 번째 이내면 다음 페이지).
 * 두 열은 번갈아 채우므로 각 사진의 위치는 (열 시작 y + 열 안 y)다. 같은 값이어도 되풀이해 알린다:
 * 다음 페이지가 실패한 뒤에는 끝에서 다시 스크롤할 때 재시도해야 하고, 중복 요청은 ViewModel이 막는다.
 */
function useVisibleReport(viewModel: DisplayViewModel, photos: readonly PostSummary[]) {
  const columnsTop = useRef(0);
  const tiles = useRef(new Map<string, { y: number; height: number }>());
  const viewport = useRef({ top: 0, height: 0 });

  const report = useCallback(() => {
    const bottom = viewport.current.top + viewport.current.height;
    if (viewport.current.height <= 0) return;
    let last = -1;
    photos.forEach((post, index) => {
      const tile = tiles.current.get(post.id);
      if (tile && columnsTop.current + tile.y < bottom && index > last) last = index;
    });
    if (last >= 0) void viewModel.onLastVisibleIndexChanged(last);
  }, [photos, viewModel]);

  // 목록이 바뀌면(추가 페이지·재검증) 스크롤 없이도 다시 계산한다.
  useEffect(() => {
    report();
  }, [report]);

  return {
    onViewportLayout: (event: LayoutChangeEvent) => {
      viewport.current.height = event.nativeEvent.layout.height;
      report();
    },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      viewport.current.top = event.nativeEvent.contentOffset.y;
      report();
    },
    onColumnsLayout: (event: LayoutChangeEvent) => {
      columnsTop.current = event.nativeEvent.layout.y;
      report();
    },
    tileLayout:
      (postId: string) => (event: { nativeEvent: { layout: { y: number; height: number } } }) => {
        tiles.current.set(postId, {
          y: event.nativeEvent.layout.y,
          height: event.nativeEvent.layout.height,
        });
        report();
      },
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { fontSize: 22, color: colors.textPrimary, paddingHorizontal: spacing.sm },
  disabled: { opacity: 0.3 },
  date: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  topic: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  description: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  tabSelected: { backgroundColor: colors.textPrimary },
  tabText: { fontSize: 13, color: colors.textSecondary },
  tabTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  message: { color: colors.textSecondary, fontSize: 15 },
  retry: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.accent,
  },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  indicator: { padding: spacing.lg },
  columns: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg },
  column: { flex: 1, gap: spacing.md },
});
