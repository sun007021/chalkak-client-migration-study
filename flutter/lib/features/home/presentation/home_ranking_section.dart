import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/components/chalkak_icon.dart';
import '../../../core/ui/components/chalkak_skeleton.dart';
import '../../../core/ui/components/chalkak_states.dart';
import '../../../core/ui/test_id.dart';
import '../domain/home_models.dart';
import '../domain/home_state.dart';

/// 랭킹 섹션 한 줄(어제 랭킹 / 오늘 인기)에 쓰는 식별자. 두 섹션이 같은 위젯을 쓰므로
/// id만 다르다.
class RankingTestIds {
  const RankingTestIds({
    required this.section,
    required this.moreLink,
    required this.empty,
    required this.error,
    required this.retryButton,
    required this.item,
    required this.likeButton,
  });

  final String section;
  final String moreLink;
  final String empty;
  final String error;
  final String retryButton;
  final String Function(String postId) item;
  final String Function(String postId) likeButton;
}

/// 랭킹 행(screens-a §7.7): 헤더(제목 + 보러가기), 82x82 사진 카드 가로 목록(최대 5장, 간격 lg).
/// 안드로이드 원본처럼 목록이 화면 끝까지 스크롤된다(contentPadding screenHorizontal).
class HomeRankingSection extends StatelessWidget {
  const HomeRankingSection({
    super.key,
    required this.title,
    required this.ids,
    required this.ranking,
    required this.onMorePressed,
    required this.onItemPressed,
    required this.onLikePressed,
    required this.onRetry,
  });

  final String title;
  final RankingTestIds ids;
  final RankingState ranking;
  final VoidCallback onMorePressed;
  final void Function(String postId) onItemPressed;
  final void Function(String postId) onLikePressed;
  final VoidCallback onRetry;

  /// HomeRankingRow 카드 한 변.
  static const double _itemSize = 82;

  @override
  Widget build(BuildContext context) {
    final ranking = this.ranking;
    final tokens = context.tokens;
    final spacing = tokens.spacing;
    return TestId(
      ids.section,
      child: Padding(
        padding: EdgeInsets.only(top: spacing.xxl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Header(
              title: title,
              moreLinkId: ids.moreLink,
              onPressed: onMorePressed,
            ),
            SizedBox(height: spacing.lg),
            switch (ranking) {
              RankingLoading() => Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: spacing.screenHorizontal,
                ),
                child: const _ItemSkeletons(),
              ),
              RankingReady(:final posts) when posts.isEmpty => Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: spacing.screenHorizontal,
                ),
                child: TestId(
                  ids.empty,
                  child: const ChalkakStatusText(Copy.homeRankingEmpty),
                ),
              ),
              RankingReady(:final posts) => SizedBox(
                height: _itemSize,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: EdgeInsets.symmetric(
                    horizontal: spacing.screenHorizontal,
                  ),
                  itemCount: posts.length,
                  separatorBuilder: (_, _) => SizedBox(width: spacing.lg),
                  itemBuilder: (context, index) => _Item(
                    post: posts[index],
                    ids: ids,
                    onPressed: () => onItemPressed(posts[index].id),
                    onLikePressed: () => onLikePressed(posts[index].id),
                  ),
                ),
              ),
              RankingError() => _Error(
                message: Copy.fill(Copy.homeRankingError, {'섹션 제목': title}),
                errorId: ids.error,
                retryId: ids.retryButton,
                onRetry: onRetry,
              ),
            },
          ],
        ),
      ),
    );
  }
}

class _ItemSkeletons extends StatelessWidget {
  const _ItemSkeletons();

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return SizedBox(
      height: HomeRankingSection._itemSize,
      child: Row(
        children: [
          for (var i = 0; i < 3; i++) ...[
            if (i > 0) SizedBox(width: tokens.spacing.lg),
            ChalkakSkeleton(
              width: HomeRankingSection._itemSize,
              height: HomeRankingSection._itemSize,
              borderRadius: BorderRadius.circular(tokens.radius.small),
            ),
          ],
        ],
      ),
    );
  }
}

/// 섹션 헤더: 제목(headline bold) + 오른쪽 "보러가기" caption + chevron 12. 줄 전체가 하나의 링크다.
class _Header extends StatelessWidget {
  const _Header({
    required this.title,
    required this.moreLinkId,
    required this.onPressed,
  });

  final String title;
  final String moreLinkId;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: tokens.spacing.screenHorizontal,
      ),
      child: TestId.button(
        moreLinkId,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onPressed,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: tokens.text.headline.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Text(
                  Copy.homeWeeklyMore,
                  style: tokens.text.caption.copyWith(
                    color: tokens.colors.textPrimary,
                  ),
                ),
                const SizedBox(width: 2),
                ChalkakIcon(
                  ChalkakIcon.chevronRight,
                  size: 12,
                  color: tokens.colors.textPrimary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({
    required this.post,
    required this.ids,
    required this.onPressed,
    required this.onLikePressed,
  });

  final PostSummary post;
  final RankingTestIds ids;
  final VoidCallback onPressed;
  final VoidCallback onLikePressed;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return SizedBox.square(
      dimension: HomeRankingSection._itemSize,
      child: Stack(
        children: [
          Positioned.fill(
            child: TestId(
              ids.item(post.id),
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: onPressed,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(tokens.radius.small),
                  child: ColoredBox(
                    color: tokens.colors.calendarCell,
                    child: AppNetworkImage(url: post.thumbnailImageUrl),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            right: tokens.spacing.xs,
            bottom: tokens.spacing.xs,
            child: _LikeBadge(
              selected: post.isLiked,
              count: post.likeCount,
              buttonId: ids.likeButton(post.id),
              onPressed: onLikePressed,
            ),
          ),
        ],
      ),
    );
  }
}

/// 사진 위 좋아요 칩: scrim 캡슐 + 하트 아이콘(빈/찬) + 개수(caption, textOnImage).
class _LikeBadge extends StatelessWidget {
  const _LikeBadge({
    required this.selected,
    required this.count,
    required this.buttonId,
    required this.onPressed,
  });

  final bool selected;
  final int count;
  final String buttonId;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return TestId.button(
      buttonId,
      child: Semantics(
        selected: selected,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onPressed,
          child: DecoratedBox(
            decoration: ShapeDecoration(
              color: tokens.colors.scrim,
              shape: const StadiumBorder(),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ChalkakIcon(
                    selected ? ChalkakIcon.heartFilled : ChalkakIcon.heart,
                    size: 12,
                    color: selected
                        ? tokens.colors.destructive
                        : tokens.colors.textOnImage,
                  ),
                  const SizedBox(width: 3),
                  Text(
                    '$count',
                    style: tokens.text.caption.copyWith(
                      color: tokens.colors.textOnImage,
                      fontSize: 11,
                      height: 14 / 11,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Error extends StatelessWidget {
  const _Error({
    required this.message,
    required this.errorId,
    required this.retryId,
    required this.onRetry,
  });

  final String message;
  final String errorId;
  final String retryId;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: context.tokens.spacing.screenHorizontal,
      ),
      child: Row(
        children: [
          Expanded(child: TestId(errorId, child: ChalkakStatusText(message))),
          TestId.button(
            retryId,
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
    );
  }
}
