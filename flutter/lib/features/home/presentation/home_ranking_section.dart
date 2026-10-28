import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/app_network_image.dart';
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

/// 제목, 더보기, 사진 가로 목록(최대 5장)과 로딩·빈·오류 상태.
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

  @override
  Widget build(BuildContext context) {
    final ranking = this.ranking;
    return TestId(
      ids.section,
      child: Padding(
        padding: const EdgeInsets.only(top: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Header(
              title: title,
              moreLinkId: ids.moreLink,
              onPressed: onMorePressed,
            ),
            const SizedBox(height: 12),
            switch (ranking) {
              RankingLoading() => const SizedBox(
                height: _itemSize,
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              ),
              RankingReady(:final posts) when posts.isEmpty => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TestId(
                  ids.empty,
                  child: const Text(Copy.homeRankingEmpty),
                ),
              ),
              RankingReady(:final posts) => SizedBox(
                height: _itemSize,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: posts.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
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

  static const double _itemSize = 140;
}

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
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      // 제목과 화살표 전체가 하나의 "더보기" 링크다.
      child: TestId.button(
        moreLinkId,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(8),
          child: Row(
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const Icon(Icons.chevron_right),
            ],
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
    return SizedBox.square(
      dimension: HomeRankingSection._itemSize,
      child: Stack(
        children: [
          Positioned.fill(
            child: TestId(
              ids.item(post.id),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    AppNetworkImage(url: post.thumbnailImageUrl),
                    Material(
                      type: MaterialType.transparency,
                      child: InkWell(onTap: onPressed),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            right: 4,
            bottom: 4,
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
    return TestId.button(
      buttonId,
      child: Semantics(
        selected: selected,
        child: Material(
          color: Colors.black.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            onTap: onPressed,
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    selected ? Icons.favorite : Icons.favorite_border,
                    size: 16,
                    color: selected ? Colors.redAccent : Colors.white,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '$count',
                    style: const TextStyle(color: Colors.white, fontSize: 12),
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
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(child: TestId(errorId, child: Text(message))),
          TestId.button(
            retryId,
            child: TextButton(
              onPressed: onRetry,
              child: const Text(Copy.commonRetry),
            ),
          ),
        ],
      ),
    );
  }
}
