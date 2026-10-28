import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/text/code_points.dart';
import '../../../core/ui/app_network_image.dart';
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
        color: Theme.of(context).scaffoldBackgroundColor,
        child: SafeArea(
          bottom: false,
          child: ListenableBuilder(
            listenable: viewModel,
            builder: (context, _) {
              final state = viewModel.state;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Header(
                    state: state,
                    onPrevious: viewModel.goPrevious,
                    onNext: viewModel.goNext,
                    onPickDate: _openDatePicker,
                  ),
                  if (state.showSortTabs)
                    _SortTabs(
                      selected: state.sort,
                      onSelected: viewModel.selectSort,
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
      child: Center(child: CircularProgressIndicator()),
    ),
    DisplayStatus.empty => const TestId(
      DisplayTestIds.emptyState,
      child: Center(child: Text(Copy.displayEmpty)),
    ),
    DisplayStatus.error => _ErrorBody(
      text: state.errorText ?? Copy.displayError,
      onRetry: widget.viewModel.retry,
    ),
    DisplayStatus.content => _Content(
      state: state,
      controller: _scroll,
      onItemShown: widget.viewModel.onVisibleIndexChanged,
      onPostTapped: widget.viewModel.onPostTapped,
      onLikeTapped: widget.viewModel.onLikeTapped,
      onFeaturedPageChanged: widget.viewModel.onFeaturedPageChanged,
    ),
  };
}

class _Header extends StatelessWidget {
  const _Header({
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
    final textTheme = Theme.of(context).textTheme;
    final topic = state.topic;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              TestId.button(
                DisplayTestIds.prevDateButton,
                child: IconButton(
                  tooltip: Copy.displayNavPrevious,
                  icon: const Icon(Icons.chevron_left),
                  onPressed: state.canGoPrevious ? onPrevious : null,
                ),
              ),
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: onPickDate,
                child: TestId(
                  DisplayTestIds.dateLabel,
                  child: Text(state.dateLabel, style: textTheme.titleLarge),
                ),
              ),
              TestId.button(
                DisplayTestIds.datePickerButton,
                child: IconButton(
                  tooltip: Copy.displayPickerTitle,
                  icon: const Icon(Icons.arrow_drop_down),
                  onPressed: onPickDate,
                ),
              ),
              TestId.button(
                DisplayTestIds.nextDateButton,
                child: IconButton(
                  tooltip: Copy.displayNavNext,
                  icon: const Icon(Icons.chevron_right),
                  onPressed: state.canGoNext ? onNext : null,
                ),
              ),
            ],
          ),
          if (topic != null)
            TestId(
              DisplayTestIds.topicTitle,
              child: Text(
                topic.title,
                style: textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
            ),
          TestId(
            DisplayTestIds.description,
            child: Text(
              state.description,
              style: textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}

class _SortTabs extends StatelessWidget {
  const _SortTabs({required this.selected, required this.onSelected});

  final DisplaySort selected;
  final ValueChanged<DisplaySort> onSelected;

  @override
  Widget build(BuildContext context) {
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
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Row(
        children: [
          for (final (sort, id, label) in tabs)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: SelectableTestId(
                id,
                selected: sort == selected,
                child: ChoiceChip(
                  label: Text(label),
                  selected: sort == selected,
                  onSelected: (_) => onSelected(sort),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.text, required this.onRetry});

  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return TestId(
      DisplayTestIds.errorState,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(text),
            const SizedBox(height: 12),
            TestId.button(
              DisplayTestIds.retryButton,
              child: FilledButton(
                onPressed: onRetry,
                child: const Text(Copy.displayRetry),
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
    required this.onItemShown,
    required this.onPostTapped,
    required this.onLikeTapped,
    required this.onFeaturedPageChanged,
  });

  /// 한 줄의 높이. 폭과 무관하게 고정해 작은 화면에서도 여러 줄이 한눈에 들어온다.
  static const double _cellHeight = 200;

  final DisplayState state;
  final ScrollController controller;
  final ValueChanged<int> onItemShown;
  final ValueChanged<String> onPostTapped;
  final ValueChanged<String> onLikeTapped;
  final ValueChanged<int> onFeaturedPageChanged;

  @override
  Widget build(BuildContext context) {
    final items = state.items;
    return Stack(
      children: [
        TestId(
          DisplayTestIds.grid,
          child: CustomScrollView(
            controller: controller,
            slivers: [
              if (state.isArchive && state.featured.isNotEmpty)
                SliverToBoxAdapter(
                  child: _FeaturedPager(
                    key: ValueKey(state.selectedDate),
                    cards: state.featured,
                    initialPage: state.featuredPage,
                    onPageChanged: onFeaturedPageChanged,
                    onTap: onPostTapped,
                  ),
                ),
              if (state.isArchive)
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: Text(Copy.displayGridTitle),
                  ),
                ),
              SliverPadding(
                padding: const EdgeInsets.all(12),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    mainAxisExtent: _cellHeight,
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
          const Positioned(
            bottom: 16,
            left: 0,
            right: 0,
            child: TestId(
              DisplayTestIds.loadMoreIndicator,
              child: Center(child: CircularProgressIndicator()),
            ),
          ),
      ],
    );
  }
}

/// 그리드 한 칸. 화면에 새로 만들어질 때 한 번 위치를 알린다(다음 페이지 판단용).
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
    final theme = Theme.of(context);
    return TestId(
      DisplayTestIds.item(card.id),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(12),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Column(
            children: [
              Expanded(
                child: InkWell(
                  onTap: widget.onTap,
                  child: SizedBox.expand(
                    child: AppNetworkImage(url: card.thumbnailImageUrl),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(left: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        PostTitle.display(card.title),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                    LikeButton(
                      buttonId: DisplayTestIds.likeButton(card.id),
                      countId: DisplayTestIds.likeCount(card.id),
                      isLiked: card.isLiked,
                      likeCount: card.likeCount,
                      onPressed: widget.onLike,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 아카이브 상위 카드 페이저. 날짜가 바뀌면 새로 만들어져 처음 페이지로 돌아간다.
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
  static const double _height = 300;

  late final PageController _controller = PageController(
    initialPage: widget.initialPage.clamp(0, widget.cards.length - 1),
    viewportFraction: 0.85,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TestId(
      DisplayTestIds.featuredPager,
      child: SizedBox(
        height: _height,
        child: PageView.builder(
          controller: _controller,
          itemCount: widget.cards.length,
          onPageChanged: widget.onPageChanged,
          itemBuilder: (context, index) {
            final card = widget.cards[index];
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
              child: TestId(
                DisplayTestIds.featuredItem(card.id),
                child: _FeaturedCard(
                  card: card,
                  onTap: () => widget.onTap(card.id),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

/// 추천 카드. 좋아요 값은 그리드와 같은 저장소 값을 읽기만 한다.
class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({required this.card, required this.onTap});

  final PostCard card;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        child: Stack(
          fit: StackFit.expand,
          children: [
            AppNetworkImage(url: card.thumbnailImageUrl),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: ColoredBox(
                color: Colors.black54,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          PostTitle.display(card.title),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: Colors.white,
                          ),
                        ),
                      ),
                      Icon(
                        card.isLiked ? Icons.favorite : Icons.favorite_border,
                        size: 16,
                        color: Colors.white,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${card.likeCount}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
