import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
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
import { colors, radius, spacing, typography } from '../../shared/design/tokens';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/icons/Icon';
import { RoundIconButton } from '../../shared/ui/RoundIconButton';
import { Skeleton } from '../../shared/ui/Skeleton';
import { SortSelector } from '../../shared/ui/SortSelector';
import { collapseProgress } from './displayDateRange';
import { type MasonryAssignment, sameAssignment, splitMasonry } from './masonry';
import { DatePickerSheet } from './ui/DatePickerSheet';
import { FeaturedPager } from './ui/FeaturedPager';
import { DEFAULT_PHOTO_RATIO, PhotoTile } from './ui/PhotoTile';
import type { DisplayViewModel } from './DisplayViewModel';
import { Text } from '../../shared/ui/Text';

/** 헤더(주제·설명)가 다 접히는 스크롤 거리와 접히기 전 높이. */
const COLLAPSE_DISTANCE = 96;
const COLLAPSIBLE_HEIGHT = 99;

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
  const [placed, setPlaced] = useState<MasonryAssignment>(() => new Map());
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
  // 한 번 놓인 사진은 열을 옮기지 않는다(이미지 로드 후 점프 방지). 렌더마다 같은 입력이면 같은 결과다.
  const { columns: half, assignment } = splitMasonry(state.photos, ratios, placed);
  if (!sameAssignment(placed, assignment)) setPlaced(assignment);

  return (
    <View testID="display.root" style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.dateRow}>
        <Pressable
          testID="display.prev-date-button"
          accessibilityRole="button"
          accessibilityLabel={t('display.nav.previous')}
          disabled={!state.canGoPrevious}
          onPress={() => void viewModel.goPrevious()}
          style={styles.arrow}
        >
          <Icon
            name="ic_display_arrow_left"
            size={24}
            color={state.canGoPrevious ? colors.iconSecondary : colors.textInactive}
          />
        </Pressable>
        <Pressable
          testID="display.date-picker-button"
          accessibilityRole="button"
          accessibilityHint="눌러서 날짜를 선택해요"
          onPress={() => setPickerOpen(true)}
          style={styles.dateButton}
        >
          <Text testID="display.date-label" numberOfLines={1} style={styles.date}>
            {formatMonthDay(state.date)}
          </Text>
        </Pressable>
        <Pressable
          testID="display.next-date-button"
          accessibilityRole="button"
          accessibilityLabel={t('display.nav.next')}
          disabled={!state.canGoNext}
          onPress={() => void viewModel.goNext()}
          style={styles.arrow}
        >
          <Icon
            name="ic_display_arrow_right"
            size={24}
            color={state.canGoNext ? colors.iconSecondary : colors.textInactive}
          />
        </Pressable>
      </View>
      <View
        style={{
          height: COLLAPSIBLE_HEIGHT * (1 - collapse),
          opacity: 1 - collapse,
          overflow: 'hidden',
        }}
      >
        <View style={styles.topicBox}>
          <Text testID="display.topic-title" style={styles.topic} numberOfLines={1}>
            {state.topic?.title ?? ''}
          </Text>
          <Text testID="display.description" style={styles.description} numberOfLines={1}>
            {state.mode === 'archive'
              ? t('display.header.desc-archive')
              : t('display.header.desc-latest')}
          </Text>
        </View>
      </View>
      <View style={styles.divider} />
      {state.mode === 'latest' ? (
        <View style={styles.sort}>
          <SortSelector
            selected={state.sort}
            onSelect={(sort) => void viewModel.selectSort(sort)}
            options={SORTS.map(({ sort, testID, label }) => ({
              value: sort,
              testID,
              label: label(),
            }))}
          />
        </View>
      ) : null}

      {state.status === 'loading' ? (
        <View testID="display.loading" style={styles.skeletonGrid}>
          {[0, 1].map((column) => (
            <View key={column} style={styles.column}>
              {SKELETON_RATIOS[column].map((ratio, i) => (
                <Skeleton key={i} style={[styles.skeletonCard, { aspectRatio: ratio }]} />
              ))}
            </View>
          ))}
        </View>
      ) : null}
      {state.status === 'empty' ? (
        <View style={styles.center}>
          <EmptyState testID="display.empty-state" title={t('display.empty')} />
        </View>
      ) : null}
      {state.status === 'error' ? (
        <View style={styles.center}>
          <Text testID="display.error-state" style={styles.message}>
            {state.errorKind === 'network' ? t('common.error.network') : t('display.error')}
          </Text>
          <RoundIconButton
            testID="display.retry-button"
            accessibilityLabel={t('display.retry')}
            size={48}
            iconSize={20}
            onPress={() => void viewModel.retry()}
          />
        </View>
      ) : null}

      {hasGrid ? (
        <ScrollView
          ref={scrollRef}
          testID="display.grid"
          onLayout={visible.onViewportLayout}
          onScroll={onScroll}
          scrollEventThrottle={50}
          contentContainerStyle={styles.gridContent}
        >
          {state.refreshing ? (
            <ActivityIndicator
              testID="display.refresh-indicator"
              color={colors.actionPrimary}
              style={styles.indicator}
            />
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
          <View
            style={[styles.columns, state.mode === 'archive' && styles.columnsAfterFeatured]}
            onLayout={visible.onColumnsLayout}
          >
            {half.map((posts, column) => (
              <View key={column} testID={`display.column-${column}`} style={styles.column}>
                {posts.map((post) => (
                  <PhotoTile
                    key={post.id}
                    post={post}
                    ids={GRID_IDS}
                    ratio={ratios[post.id] ?? DEFAULT_PHOTO_RATIO}
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
            <ActivityIndicator
              testID="display.load-more-indicator"
              color={colors.actionPrimary}
              style={styles.indicator}
            />
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

// 원본 전시 레이아웃(screens-b.md §2.1~2.2): 날짜 헤더 높이 52(가로 25), 주제 영역 위 15 / 아래 24 + 0.5px 구분선,
// 그리드 2열 간격 12, 좌우 25, 아래 40. 정렬 선택기는 구분선 바로 아래 왼쪽.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  dateRow: {
    height: 52,
    paddingLeft: spacing.screenHorizontal - 13,
    paddingRight: spacing.screenHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateButton: { minHeight: 44, justifyContent: 'center', marginRight: spacing.xs },
  date: { ...typography.headline, color: colors.textPrimary },
  topicBox: {
    paddingTop: 15,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.screenHorizontal,
    gap: spacing.md,
  },
  topic: { ...typography.title2, color: colors.textPrimary },
  description: { ...typography.subheadline, color: colors.textInactive },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, opacity: 0.4 },
  sort: { paddingHorizontal: spacing.screenHorizontal },
  center: { flex: 1, alignItems: 'center', paddingTop: 96, gap: spacing.xl },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  indicator: { padding: spacing.lg },
  gridContent: { paddingBottom: spacing.xxl },
  columns: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 11,
  },
  columnsAfterFeatured: { paddingTop: spacing.xs },
  column: { flex: 1, gap: spacing.md },
  skeletonGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 11,
  },
  skeletonCard: { width: '100%', borderRadius: radius.photoCard },
});

/** 로딩 스켈레톤 카드 비율(열마다). 원본 iOS는 카드 비율 그대로 스켈레톤을 그린다. */
const SKELETON_RATIOS: readonly (readonly number[])[] = [
  [3 / 4, 1, 3 / 4],
  [1, 3 / 4, 1],
];
