import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/time/kst_format.dart';
import '../../../core/ui/components/chalkak_icon.dart';
import '../../../core/ui/components/chalkak_logo.dart';
import '../../../core/ui/components/chalkak_skeleton.dart';
import '../../../core/ui/components/chalkak_states.dart';
import '../../../core/ui/test_id.dart';
import '../../banner/domain/banner_list_controller.dart';
import '../domain/home_state.dart';
import '../domain/home_view_model.dart';
import 'home_hero_card.dart';
import 'home_issue_section.dart';
import 'home_ranking_section.dart';
import 'home_test_ids.dart';
import 'home_week_section.dart';

/// AI 피드백 카드 자리. AIR PR이 실제 카드를 주입한다. 홈은 [postId]가 있을 때만 이 빌더를
/// 호출해 `home.ai-card` 영역에 넣는다(REQ-HOME-034). `home.ai-card` id는 빌더가 만든
/// 위젯이 단다.
typedef HomeAiCardBuilder = Widget Function(
  BuildContext context,
  String postId, {
  required KstDate topicDate,
  required bool visible,
});

/// 홈 탭 화면. [HomeViewModel.state]를 그리기만 한다. 루트는 `home.root`.
/// 섹션과 요소는 testids.md 홈 절의 id를 쓰고, 상태 표시 요소는 해당 상태일 때만 트리에 둔다.
/// - 상단: `home.notification-button`, 미읽음이면 `home.notification-unread-dot`
/// - 머리글: `home.topic-date`("M월 d일 · 오늘의 주제"), `home.topic-title`
/// - 히어로: 상태별 `home.hero-*`(Empty는 `home.hero-upload-button` 포함)
/// - 이번 주: `home.week-section`, 일~토 `home.week-day-{date}`, 기록이 있는 날 `home.week-photo-{date}`
/// - 랭킹: `home.ranking-*`, `home.popular-*`, 더보기 링크, 빈 상태 `home.ranking-empty`
/// - 배너: `home.issue-section`(0건·오류면 없음), 카드 `home.issue-item-{bannerId}`
/// - `home.scroll`: 스크롤 영역. 새로고침 중에는 `home.refresh-indicator`가 보인다.
/// 이미지는 로드 실패해도 항목만 대체 표시하고 위젯 트리를 깨지 않는다(errorBuilder).
class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.viewModel,
    required this.aiCardBuilder,
    this.aiCardVisible = true,
    this.scrollController,
  });

  final HomeViewModel viewModel;
  final HomeAiCardBuilder aiCardBuilder;

  /// 홈 탭이 선택돼 있고 다른 화면에 덮이지 않았는가(AI 카드의 조회·폴링 가시성).
  final bool aiCardVisible;

  /// 셸이 맨 위 스크롤(탭 재선택)을 하려고 넘기는 컨트롤러.
  final ScrollController? scrollController;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const _rankingYesterdayIds = RankingTestIds(
    section: HomeTestIds.rankingSection,
    moreLink: HomeTestIds.rankingMoreLink,
    empty: HomeTestIds.rankingEmpty,
    error: HomeTestIds.rankingError,
    retryButton: HomeTestIds.rankingRetryButton,
    item: HomeTestIds.rankingItem,
    likeButton: HomeTestIds.rankingLikeButton,
  );
  static const _rankingPopularIds = RankingTestIds(
    section: HomeTestIds.popularSection,
    moreLink: HomeTestIds.popularMoreLink,
    empty: HomeTestIds.popularEmpty,
    error: HomeTestIds.popularError,
    retryButton: HomeTestIds.popularRetryButton,
    item: HomeTestIds.popularItem,
    likeButton: HomeTestIds.popularLikeButton,
  );

  ScrollController? _ownedController;

  ScrollController get _controller =>
      widget.scrollController ?? (_ownedController ??= ScrollController());

  @override
  void dispose() {
    _ownedController?.dispose();
    super.dispose();
  }

  void _onPull() {
    // 진행 표시는 상태의 `isRefreshing`이 맡으므로 당김 제스처는 곧바로 닫는다.
    unawaited(widget.viewModel.refresh());
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = widget.viewModel;
    return TestId(
      HomeTestIds.root,
      child: ListenableBuilder(
        listenable: viewModel,
        builder: (context, _) {
          final state = viewModel.state;
          return Column(
            children: [
              _TopBar(
                hasUnread: state.hasUnread,
                onNotificationPressed: viewModel.onNotificationPressed,
              ),
              if (state.isRefreshing)
                const TestId(
                  HomeTestIds.refreshIndicator,
                  child: LinearProgressIndicator(minHeight: 2),
                ),
              Expanded(
                child: TestId(
                  HomeTestIds.scroll,
                  child: RefreshIndicator(
                    color: context.tokens.colors.actionPrimary,
                    backgroundColor: context.tokens.colors.surfaceElevated,
                    onRefresh: () async => _onPull(),
                    child: _content(context, state),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _content(BuildContext context, HomeState state) {
    final viewModel = widget.viewModel;
    final banners = state.banners;
    final aiCardPostId = state.aiCardPostId;
    final showBanners = banners.status == BannerListStatus.ready;
    return CustomScrollView(
      controller: _controller,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverList.list(
          children: [
            _TopicHeader(topic: state.topic, onRetry: viewModel.retryTopic),
            SizedBox(height: context.tokens.spacing.xl),
            HomeHeroCard(
              hero: state.hero,
              onPressed: viewModel.onHeroPressed,
              onRetry: viewModel.retryHero,
            ),
            if (aiCardPostId != null)
              Padding(
                padding: EdgeInsets.fromLTRB(
                  context.tokens.spacing.screenHorizontal,
                  context.tokens.spacing.lg,
                  context.tokens.spacing.screenHorizontal,
                  0,
                ),
                child: widget.aiCardBuilder(
                  context,
                  aiCardPostId,
                  topicDate: state.today,
                  visible: widget.aiCardVisible,
                ),
              ),
            HomeWeekSection(
              weekly: state.weekly,
              onDayPressed: viewModel.onWeekDayPressed,
              onMorePressed: viewModel.onWeekMorePressed,
              onRetry: viewModel.retryWeekly,
            ),
            HomeRankingSection(
              title: Copy.homeRankingYesterdayTitle,
              ids: _rankingYesterdayIds,
              ranking: state.yesterday,
              onMorePressed: () =>
                  viewModel.onRankingMorePressed(RankingKind.yesterday),
              onItemPressed: viewModel.onRankingItemPressed,
              onLikePressed: viewModel.onLikePressed,
              onRetry: () => viewModel.retryRanking(RankingKind.yesterday),
            ),
            HomeRankingSection(
              title: Copy.homeRankingTodayTitle,
              ids: _rankingPopularIds,
              ranking: state.popular,
              onMorePressed: () =>
                  viewModel.onRankingMorePressed(RankingKind.popular),
              onItemPressed: viewModel.onRankingItemPressed,
              onLikePressed: viewModel.onLikePressed,
              onRetry: () => viewModel.retryRanking(RankingKind.popular),
            ),
            if (showBanners) const HomeIssueHeader(),
            if (banners.status == BannerListStatus.error)
              HomeIssueError(onRetry: viewModel.retryBanners),
          ],
        ),
        if (showBanners)
          SliverList.builder(
            itemCount: banners.items.length,
            itemBuilder: (context, index) {
              final item = banners.items[index];
              return HomeIssueCard(
                key: ValueKey(item.id),
                item: item,
                index: index,
                onPressed: () => viewModel.onBannerPressed(item),
                onVisible: viewModel.onBannerVisible,
              );
            },
          ),
        SliverToBoxAdapter(
          child: SizedBox(
            height: context.tokens.spacing.xxl + context.tokens.spacing.sm,
            child: banners.isLoadingMore
                ? const Center(child: ChalkakSpinner(size: 20))
                : null,
          ),
        ),
      ],
    );
  }
}

/// 홈 상단 바(screens-a §7.2): 높이 55, 로고 + 알림 버튼(ic_notification 24, 터치 44), 아래 divider.
/// 미읽음 점은 지름 7 inputCursor 색이다.
class _TopBar extends StatelessWidget {
  const _TopBar({required this.hasUnread, required this.onNotificationPressed});

  final bool hasUnread;
  final VoidCallback onNotificationPressed;

  static const _height = 55.0;
  static const _dotSize = 7.0;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tokens.colors.background,
        border: Border(bottom: BorderSide(color: tokens.colors.border)),
      ),
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: _height,
          child: Padding(
            padding: EdgeInsets.only(
              left: tokens.spacing.screenHorizontal,
              right: tokens.spacing.screenHorizontal - 10,
            ),
            child: Row(
              children: [
                const ChalkakLogo(),
                const Spacer(),
                TestId.button(
                  HomeTestIds.notificationButton,
                  child: Semantics(
                    button: true,
                    label: Copy.notiInboxTitle,
                    excludeSemantics: true,
                    onTap: onNotificationPressed,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: onNotificationPressed,
                      child: SizedBox.square(
                        dimension: 44,
                        child: Stack(
                          alignment: Alignment.center,
                          clipBehavior: Clip.none,
                          children: [
                            ChalkakIcon(
                              ChalkakIcon.notification,
                              size: 24,
                              color: tokens.colors.iconPrimary,
                            ),
                            if (hasUnread)
                              Positioned(
                                top: 44 / 2 - 12 - 2,
                                right: 44 / 2 - 12 - 2,
                                child: TestId(
                                  HomeTestIds.notificationUnreadDot,
                                  child: SizedBox.square(
                                    dimension: _dotSize,
                                    child: DecoratedBox(
                                      decoration: BoxDecoration(
                                        color: tokens.colors.inputCursor,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 오늘의 주제 헤더(screens-a §7.3): 위 xl+sm, "M월 d일 · 오늘의 주제" subheadline,
/// 주제명 title2, 둘 사이 sm. 로딩·오류·빈 상태는 같은 자리에 한 줄 문구로 보인다.
class _TopicHeader extends StatelessWidget {
  const _TopicHeader({required this.topic, required this.onRetry});

  final TopicState topic;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final status = tokens.text.subheadline.copyWith(
      color: tokens.colors.textSecondary,
    );
    return Padding(
      padding: EdgeInsets.fromLTRB(
        tokens.spacing.screenHorizontal,
        tokens.spacing.xl + tokens.spacing.sm,
        tokens.spacing.screenHorizontal,
        0,
      ),
      child: switch (topic) {
        TopicLoading() => TestId(
          HomeTestIds.loading,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(Copy.homeTopicLoading, style: status),
              SizedBox(height: tokens.spacing.sm),
              ChalkakSkeleton(
                width: 180,
                height: 28,
                borderRadius: BorderRadius.circular(tokens.radius.small),
              ),
            ],
          ),
        ),
        TopicNotReady() => Text(Copy.homeTopicNotReady, style: status),
        TopicError() => TestId(
          HomeTestIds.errorState,
          child: Row(
            children: [
              Expanded(child: Text(Copy.homeTopicError, style: status)),
              TestId.button(
                HomeTestIds.retryButton,
                child: Semantics(
                  button: true,
                  label: Copy.commonRetry,
                  excludeSemantics: true,
                  onTap: onRetry,
                  child: ChalkakRetryCircleButton(
                    onPressed: onRetry,
                    size: 32,
                    iconSize: 15,
                  ),
                ),
              ),
            ],
          ),
        ),
        TopicReady(:final topic) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TestId(
              HomeTestIds.topicDate,
              child: Text(
                KstFormat.todayTopicLabel(topic.topicDate),
                style: tokens.text.subheadline.copyWith(
                  color: tokens.colors.textPrimary,
                ),
              ),
            ),
            SizedBox(height: tokens.spacing.sm),
            TestId(
              HomeTestIds.topicTitle,
              child: Text(
                topic.title,
                style: tokens.text.title2.copyWith(
                  color: tokens.colors.textPrimary,
                ),
              ),
            ),
          ],
        ),
      },
    );
  }
}
