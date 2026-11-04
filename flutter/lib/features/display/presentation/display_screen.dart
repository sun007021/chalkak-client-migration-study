import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/text/code_points.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/components/chalkak_icon.dart';
import '../../../core/ui/components/chalkak_skeleton.dart';
import '../../../core/ui/components/chalkak_states.dart';
import '../../../core/ui/selectable_test_id.dart';
import '../../../core/ui/test_id.dart';
import '../../feed/domain/feed_target.dart';
import '../../like/domain/toast_message.dart';
import '../../like/presentation/like_button.dart';
import '../domain/display_models.dart';
import 'date_picker_sheet.dart';
import 'display_test_ids.dart';
import 'display_view_model.dart';

/// 전시 탭 화면(단독 위젯). 탭·라우트 연결은 통합 단계에서 한다.
///
/// - 좋아요 실패·게스트 토스트는 이 화면이 아니라 `LikeStore.toasts`로 나간다(앱의 토스트 호스트가 한 곳에서
///   구독한다. 전시와 상세가 동시에 떠 있어도 토스트가 두 번 뜨지 않게 하려는 것이다).
/// - 이미지는 `errorBuilder`를 둔다(위젯 테스트의 네트워크 이미지는 실패한다).
/// - 화면이 mounted인 동안만 `viewModel.events`를 구독해 [DisplayToast]는 [onToast],
///   [DisplayOpenFeed]는 [onOpenFeed], [DisplayScrollToTop]은 그리드를 맨 위로 보낸다.
/// - [DisplayState.status]에 따라 `display.loading` / `display.empty-state`(+`Copy.displayEmpty`) /
///   `display.error-state`(+`display.retry-button`) / 콘텐츠를 그린다. 해당 상태일 때만 트리에 존재한다.
/// - 머리글: `display.date-label`, `display.prev-date-button`·`next-date-button`(enabled는 canGoPrevious/Next),
///   `display.date-picker-button`(누르면 [DatePickerSheet]를 열고 확인 시 `selectDate`),
///   `display.topic-title`, `display.description`.
/// - 정렬 탭 3개(selected 노출)는 `showSortTabs`일 때만. 아카이브면 `display.featured-pager`와
///   `display.featured-item-{postId}`. 그리드 항목 `display.item-{postId}`(탭 → `onPostTapped`),
///   하트 `display.like-button-{postId}`·수 `display.like-count-{postId}`(탭 → `onLikeTapped`).
/// - 스크롤이 끝에 가까워지면 `onVisibleIndexChanged(마지막으로 보인 index)`를 부른다.
///   (항목이 새로 화면에 만들어질 때 한 번씩 알린다. 실패한 다음 페이지를 제자리에서 계속 다시 부르지 않는다.)
class DisplayScreen extends StatefulWidget {
  const DisplayScreen({
    super.key,
    required this.viewModel,
    required this.onToast,
    required this.onOpenFeed,
  });

  final DisplayViewModel viewModel;
  final ValueChanged<ToastMessage> onToast;
  final ValueChanged<FeedTarget> onOpenFeed;

  @override
  State<DisplayScreen> createState() => _DisplayScreenState();
}

class _DisplayScreenState extends State<DisplayScreen> {
  static const Duration _scrollToTopDuration = Duration(milliseconds: 100);

  final ScrollController _scroll = ScrollController();
  StreamSubscription<DisplayEvent>? _events;

  @override
  void initState() {
    super.initState();
    _listen();
  }

  @override
  void didUpdateWidget(DisplayScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.viewModel != widget.viewModel) {
      unawaited(_events?.cancel());
      _listen();
    }
  }

  void _listen() {
    _events = widget.viewModel.events.listen(_onEvent);
  }

  @override
  void dispose() {
    unawaited(_events?.cancel());
    _scroll.dispose();
    super.dispose();
  }

  void _onEvent(DisplayEvent event) {
    if (!mounted) return;
    switch (event) {
      case DisplayToast(:final message):
        widget.onToast(message);
      case DisplayOpenFeed(:final target):
        widget.onOpenFeed(target);
      case DisplayScrollToTop():
        if (_scroll.hasClients) {
          unawaited(
            _scroll.animateTo(
              0,
              duration: _scrollToTopDuration,
              curve: Curves.easeOut,
            ),
          );
        }
    }
  }

  void _openDatePicker() {
    final state = widget.viewModel.state;
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (sheetContext) => DatePickerSheet(
          initial: state.selectedDate,
          today: state.today,
          onConfirm: (date) {
            Navigator.of(sheetContext).pop();
            unawaited(widget.viewModel.selectDate(date));
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = widget.viewModel;
    return TestId(
      DisplayTestIds.root,
      child: Material(
        color: context.tokens.colors.background,
        child: SafeArea(
          bottom: false,
          child: ListenableBuilder(
            listenable: viewModel,
            builder: (context, _) {
              final state = viewModel.state;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _DateHeader(
                    state: state,
                    onPrevious: viewModel.goPrevious,
                    onNext: viewModel.goNext,
                    onPickDate: _openDatePicker,
                  ),
                  Expanded(child: _body(state)),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _body(DisplayState state) => switch (state.status) {
    DisplayStatus.loading => const TestId(
      DisplayTestIds.loading,
      child: _GridSkeleton(),
    ),
    DisplayStatus.empty => TestId(
      DisplayTestIds.emptyState,
      child: Padding(
        padding: const EdgeInsets.only(top: 96),
        child: Align(
          alignment: Alignment.topCenter,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ChalkakIcon(
                ChalkakIcon.photoLibrary,
                size: 34,
                color: context.tokens.colors.iconSecondary,
              ),
              SizedBox(height: context.tokens.spacing.sm),
              const ChalkakEmptyState(title: Copy.displayEmpty),
            ],
          ),
        ),
      ),
    ),
    DisplayStatus.error => _ErrorBody(
      text: state.errorText ?? Copy.displayError,
      onRetry: widget.viewModel.retry,
    ),
    DisplayStatus.content => _Content(
      state: state,
      controller: _scroll,
      onSortSelected: widget.viewModel.selectSort,
      onItemShown: widget.viewModel.onVisibleIndexChanged,
      onPostTapped: widget.viewModel.onPostTapped,
      onLikeTapped: widget.viewModel.onLikeTapped,
      onFeaturedPageChanged: widget.viewModel.onFeaturedPageChanged,
    ),
  };
}

/// 날짜 이동 줄(screens-b §2.1 DisplayDateHeader): 높이 52, 좌우 screenHorizontal,
/// ‹ 날짜(headline) ▾ › 순서. ‹ › 는 `ic_display_arrow_*` 24, 활성 iconSecondary / 비활성 textInactive.
class _DateHeader extends StatelessWidget {
  const _DateHeader({
    required this.state,
    required this.onPrevious,
    required this.onNext,
    required this.onPickDate,
  });

  final DisplayState state;
  final VoidCallback onPrevious;
  final VoidCallback onNext;
  final VoidCallback onPickDate;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    Widget arrow(String id, String icon, String label, VoidCallback? onTap) {
      final enabled = onTap != null;
      return TestId.button(
        id,
        child: Semantics(
          button: true,
          enabled: enabled,
          label: label,
          excludeSemantics: true,
          onTap: onTap,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            child: SizedBox.square(
              dimension: 44,
              child: Center(
                child: ChalkakIcon(
                  icon,
                  size: 24,
                  color: enabled
                      ? tokens.colors.iconSecondary
                      : tokens.colors.textInactive,
                ),
              ),
            ),
          ),
        ),
      );
    }

    return SizedBox(
      height: 52,
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: tokens.spacing.screenHorizontal - 13,
        ),
        child: Row(
          children: [
            arrow(
              DisplayTestIds.prevDateButton,
              ChalkakIcon.displayArrowLeft,
              Copy.displayNavPrevious,
              state.canGoPrevious ? onPrevious : null,
            ),
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: onPickDate,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 44),
                child: Center(
                  child: TestId(
                    DisplayTestIds.dateLabel,
                    child: Text(
                      state.dateLabel,
                      maxLines: 1,
                      style: tokens.text.headline.copyWith(
                        color: tokens.colors.textPrimary,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            TestId.button(
              DisplayTestIds.datePickerButton,
              child: Semantics(
                button: true,
                label: Copy.displayPickerTitle,
                excludeSemantics: true,
                onTap: onPickDate,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: onPickDate,
                  child: SizedBox.square(
                    dimension: 36,
                    child: Center(
                      child: ChalkakIcon(
                        ChalkakIcon.chevronDown,
                        size: 16,
                        color: tokens.colors.photoActionText,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            arrow(
              DisplayTestIds.nextDateButton,
              ChalkakIcon.displayArrowRight,
              Copy.displayNavNext,
              state.canGoNext ? onNext : null,
            ),
          ],
        ),
      ),
    );
  }
}

/// 주제 머리글(screens-b §2.1 DisplayTopic): 위 15, 아래 24, 좌우 screenHorizontal, 바닥 border 선.
/// 주제 title2, 설명 subheadline textInactive(사이 12). 스크롤 영역 안에서 콘텐츠와 함께 움직인다.
class _TopicHeader extends StatelessWidget {
  const _TopicHeader({required this.state});

  final DisplayState state;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final topic = state.topic;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: tokens.colors.border, width: 0.5),
        ),
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          tokens.spacing.screenHorizontal,
          15,
          tokens.spacing.screenHorizontal,
          tokens.spacing.xl,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (topic != null)
              TestId(
                DisplayTestIds.topicTitle,
                child: Text(
                  topic.title,
                  style: tokens.text.title2.copyWith(
                    color: tokens.colors.textPrimary,
                  ),
                ),
              ),
            SizedBox(height: tokens.spacing.md),
            TestId(
              DisplayTestIds.description,
              child: Text(
                state.description,
                style: tokens.text.subheadline.copyWith(
                  color: tokens.colors.textInactive,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 정렬 선택기(ChalkakSortSelector): 항목 간격 lg, subheadline, 선택은 textPrimary + 바닥 1px 밑줄,
/// 비선택은 textInactive. 터치 높이 44, 눌림 효과·애니메이션 없음.
class _SortTabs extends StatelessWidget {
  const _SortTabs({required this.selected, required this.onSelected});

  final DisplaySort selected;
  final ValueChanged<DisplaySort> onSelected;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final tabs = <(DisplaySort, String, String)>[
      (
        DisplaySort.recent,
        DisplayTestIds.sortRecentTab,
        Copy.displaySortRecent,
      ),
      (
        DisplaySort.popular,
        DisplayTestIds.sortPopularTab,
        Copy.displaySortPopular,
      ),
      (
        DisplaySort.random,
        DisplayTestIds.sortRandomTab,
        Copy.displaySortRandom,
      ),
    ];
    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: tokens.spacing.screenHorizontal,
      ),
      child: Row(
        children: [
          for (var i = 0; i < tabs.length; i++) ...[
            if (i > 0) SizedBox(width: tokens.spacing.lg),
            _SortTab(
              id: tabs[i].$2,
              label: tabs[i].$3,
              selected: tabs[i].$1 == selected,
              onTap: () => onSelected(tabs[i].$1),
            ),
          ],
        ],
      ),
    );
  }
}

class _SortTab extends StatelessWidget {
  const _SortTab({
    required this.id,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String id;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return SelectableTestId(
      id,
      selected: selected,
      child: Semantics(
        button: true,
        onTap: onTap,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Center(
              child: Container(
                padding: EdgeInsets.only(bottom: tokens.spacing.xs),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: selected
                          ? tokens.colors.textPrimary
                          : Colors.transparent,
                    ),
                  ),
                ),
                child: Text(
                  label,
                  style: tokens.text.subheadline.copyWith(
                    color: selected
                        ? tokens.colors.textPrimary
                        : tokens.colors.textInactive,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 첫 진입 로딩: 카드 비율(3:4) 스켈레톤 2열.
class _GridSkeleton extends StatelessWidget {
  const _GridSkeleton();

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return GridView.count(
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.all(tokens.spacing.screenHorizontal),
      crossAxisCount: 2,
      mainAxisSpacing: tokens.spacing.md,
      crossAxisSpacing: tokens.spacing.md,
      childAspectRatio: 3 / 4,
      children: [
        for (var i = 0; i < 6; i++)
          ChalkakSkeleton(
            borderRadius: BorderRadius.circular(tokens.radius.photoCard),
          ),
      ],
    );
  }
}

/// 오류: 가운데 메시지(body textSecondary) + xl + 48 원형 새로고침 버튼(screens-b §2.4).
class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.text, required this.onRetry});

  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return TestId(
      DisplayTestIds.errorState,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              text,
              textAlign: TextAlign.center,
              style: tokens.text.body.copyWith(
                color: tokens.colors.textSecondary,
              ),
            ),
            SizedBox(height: tokens.spacing.xl),
            TestId.button(
              DisplayTestIds.retryButton,
              child: Semantics(
                button: true,
                label: Copy.displayRetry,
                excludeSemantics: true,
                onTap: onRetry,
                child: ChalkakRetryCircleButton(
                  onPressed: onRetry,
                  size: 48,
                  iconSize: 20,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({
    required this.state,
    required this.controller,
    required this.onSortSelected,
    required this.onItemShown,
    required this.onPostTapped,
    required this.onLikeTapped,
    required this.onFeaturedPageChanged,
  });

  final DisplayState state;
  final ScrollController controller;
  final ValueChanged<DisplaySort> onSortSelected;
  final ValueChanged<int> onItemShown;
  final ValueChanged<String> onPostTapped;
  final ValueChanged<String> onLikeTapped;
  final ValueChanged<int> onFeaturedPageChanged;

  @override
  Widget build(BuildContext context) {
    final items = state.items;
    final tokens = context.tokens;
    return Stack(
      children: [
        TestId(
          DisplayTestIds.grid,
          child: CustomScrollView(
            controller: controller,
            slivers: [
              SliverToBoxAdapter(child: _TopicHeader(state: state)),
              if (state.isArchive && state.featured.isNotEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 15, bottom: 8),
                    child: _FeaturedPager(
                      key: ValueKey(state.selectedDate),
                      cards: state.featured,
                      initialPage: state.featuredPage,
                      onPageChanged: onFeaturedPageChanged,
                      onTap: onPostTapped,
                    ),
                  ),
                ),
              if (state.showSortTabs)
                SliverToBoxAdapter(
                  child: _SortTabs(
                    selected: state.sort,
                    onSelected: onSortSelected,
                  ),
                ),
              SliverPadding(
                padding: EdgeInsets.fromLTRB(
                  tokens.spacing.screenHorizontal,
                  state.showSortTabs ? 11 : 4,
                  tokens.spacing.screenHorizontal,
                  tokens.spacing.xxl,
                ),
                sliver: SliverGrid(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: tokens.spacing.md,
                    crossAxisSpacing: tokens.spacing.md,
                    // 측정 전 기본 비율 3:4(DisplayPhotoGrid.swift).
                    childAspectRatio: 3 / 4,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final card = items[index];
                      return _GridCell(
                        key: ValueKey(card.id),
                        index: index,
                        card: card,
                        onShown: onItemShown,
                        onTap: () => onPostTapped(card.id),
                        onLike: () => onLikeTapped(card.id),
                      );
                    },
                    childCount: items.length,
                    findChildIndexCallback: (key) {
                      if (key is! ValueKey<String>) return null;
                      final index = items.indexWhere((c) => c.id == key.value);
                      return index < 0 ? null : index;
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
        // 스크롤 위치와 무관하게 보이도록 목록 위에 겹쳐 그린다.
        if (state.isRefreshing || state.isNavigating)
          const Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: TestId(
              DisplayTestIds.refreshIndicator,
              child: LinearProgressIndicator(minHeight: 2),
            ),
          ),
        if (state.isPaging)
          Positioned(
            bottom: tokens.spacing.lg,
            left: 0,
            right: 0,
            child: const TestId(
              DisplayTestIds.loadMoreIndicator,
              child: Center(child: ChalkakSpinner(size: 24)),
            ),
          ),
      ],
    );
  }
}

/// 그리드 한 칸. 화면에 새로 만들어질 때 한 번 위치를 알린다(다음 페이지 판단용).
/// 카드는 검정 바탕 + 사진 + 좌하단 좋아요 배지다(제목은 그리지 않는다: DisplayMasonryCell).
class _GridCell extends StatefulWidget {
  const _GridCell({
    super.key,
    required this.index,
    required this.card,
    required this.onShown,
    required this.onTap,
    required this.onLike,
  });

  final int index;
  final PostCard card;
  final ValueChanged<int> onShown;
  final VoidCallback onTap;
  final VoidCallback onLike;

  @override
  State<_GridCell> createState() => _GridCellState();
}

class _GridCellState extends State<_GridCell> {
  @override
  void initState() {
    super.initState();
    // 빌드 중에는 ViewModel을 바꿀 수 없으니 프레임이 끝난 뒤 알린다.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onShown(widget.index);
    });
  }

  @override
  Widget build(BuildContext context) {
    final card = widget.card;
    final tokens = context.tokens;
    return TestId(
      DisplayTestIds.item(card.id),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(tokens.radius.photoCard),
        child: ColoredBox(
          color: Colors.black,
          child: Stack(
            fit: StackFit.expand,
            children: [
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: widget.onTap,
                child: AppNetworkImage(url: card.thumbnailImageUrl),
              ),
              Positioned(
                left: 0,
                bottom: 0,
                child: _LikeBadge(card: card, onLike: widget.onLike),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 좌하단 좋아요 배지(DisplayLikeBadge): 카드 모서리에서 하트까지 10만큼 터치 영역에 포함한다.
class _LikeBadge extends StatelessWidget {
  const _LikeBadge({required this.card, required this.onLike});

  final PostCard card;
  final VoidCallback onLike;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 0, bottom: 0),
      child: LikeButton(
        buttonId: DisplayTestIds.likeButton(card.id),
        countId: DisplayTestIds.likeCount(card.id),
        isLiked: card.isLiked,
        likeCount: card.likeCount,
        onImage: true,
        onPressed: onLike,
      ),
    );
  }
}

/// 아카이브 상위 카드 페이저(DisplayFeaturedCarousel). 날짜가 바뀌면 새로 만들어져 처음 페이지로 돌아간다.
/// 페이지 폭은 컨테이너 - 64, 카드 3:4, 이웃 카드는 scale 1 - 0.08*|offset|, opacity 1 - 0.12*|offset|.
class _FeaturedPager extends StatefulWidget {
  const _FeaturedPager({
    super.key,
    required this.cards,
    required this.initialPage,
    required this.onPageChanged,
    required this.onTap,
  });

  final List<PostCard> cards;
  final int initialPage;
  final ValueChanged<int> onPageChanged;
  final ValueChanged<String> onTap;

  @override
  State<_FeaturedPager> createState() => _FeaturedPagerState();
}

class _FeaturedPagerState extends State<_FeaturedPager> {
  static const double _sideInset = 32;
  static const double _pageGap = 5;

  late PageController _controller;
  late int _page = widget.initialPage.clamp(0, widget.cards.length - 1);
  double _fraction = 0.85;

  @override
  void initState() {
    super.initState();
    _controller = PageController(
      initialPage: _page,
      viewportFraction: _fraction,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _syncFraction(double width) {
    final next = (width - _sideInset * 2 + _pageGap) / width;
    if ((next - _fraction).abs() < 0.0005) return;
    _fraction = next;
    final old = _controller;
    _controller = PageController(initialPage: _page, viewportFraction: next);
    WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return TestId(
      DisplayTestIds.featuredPager,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          _syncFraction(width);
          final cardWidth = width - _sideInset * 2;
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: cardWidth * 4 / 3,
                child: PageView.builder(
                  controller: _controller,
                  itemCount: widget.cards.length,
                  onPageChanged: (index) {
                    setState(() => _page = index);
                    widget.onPageChanged(index);
                  },
                  itemBuilder: (context, index) {
                    final card = widget.cards[index];
                    return AnimatedBuilder(
                      animation: _controller,
                      builder: (context, child) {
                        final current =
                            _controller.hasClients &&
                                _controller.position.haveDimensions
                            ? (_controller.page ?? _page.toDouble())
                            : _page.toDouble();
                        final offset = (current - index).abs().clamp(0.0, 1.0);
                        return Opacity(
                          opacity: 1 - 0.12 * offset,
                          child: Transform.scale(
                            scale: 1 - 0.08 * offset,
                            child: child,
                          ),
                        );
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: _pageGap / 2,
                        ),
                        child: TestId(
                          DisplayTestIds.featuredItem(card.id),
                          child: _FeaturedCard(
                            card: card,
                            onTap: () => widget.onTap(card.id),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              if (widget.cards.length > 1) ...[
                SizedBox(height: tokens.spacing.lg),
                _PageIndicator(count: widget.cards.length, selected: _page),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// 페이지 표시기(DisplayPageIndicator): 선택 24x7 actionPrimary, 나머지 7x7 textMuted 45%.
class _PageIndicator extends StatelessWidget {
  const _PageIndicator({required this.count, required this.selected});

  final int count;
  final int selected;

  @override
  Widget build(BuildContext context) {
    final colors = context.tokens.colors;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Container(
            width: i == selected ? 24 : 7,
            height: 7,
            decoration: ShapeDecoration(
              shape: const StadiumBorder(),
              color: i == selected
                  ? colors.actionPrimary
                  : colors.textMuted.withValues(
                      alpha: 0.45 * colors.textMuted.a,
                    ),
            ),
          ),
        ],
      ],
    );
  }
}

/// 추천 카드(3:4, 검정 바탕, 사진 fit). 제목은 하단 가운데 손글씨, 좋아요 배지는 좌하단.
/// 좋아요 값은 그리드와 같은 저장소 값을 읽기만 한다.
class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({required this.card, required this.onTap});

  final PostCard card;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return ClipRRect(
      borderRadius: BorderRadius.circular(tokens.radius.photoCard),
      child: ColoredBox(
        color: Colors.black,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: Stack(
            fit: StackFit.expand,
            children: [
              AppNetworkImage(url: card.thumbnailImageUrl, fit: BoxFit.contain),
              Positioned(
                left: 12,
                right: 12,
                bottom: 10,
                child: Text(
                  PostTitle.display(card.title),
                  maxLines: 1,
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                  style: tokens.text.handwriting.copyWith(
                    color: tokens.colors.textOnImage,
                    height: 1.2,
                  ),
                ),
              ),
              Positioned(
                left: 0,
                bottom: 0,
                child: IgnorePointer(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ChalkakIcon(
                        card.isLiked
                            ? ChalkakIcon.heartFilled
                            : ChalkakIcon.heart,
                        size: 18,
                        color: tokens.colors.textOnImage,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${card.likeCount}',
                        style: tokens.text.subheadline.copyWith(
                          color: tokens.colors.textOnImage,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
