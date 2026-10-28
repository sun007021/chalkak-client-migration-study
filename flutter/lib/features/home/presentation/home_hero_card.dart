import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/test_id.dart';
import '../domain/home_state.dart';
import 'home_test_ids.dart';

/// 히어로 7상태(D-06)를 그린다. 상태 표시 요소는 해당 상태일 때만 트리에 있다.
class HomeHeroCard extends StatelessWidget {
  const HomeHeroCard({
    super.key,
    required this.hero,
    required this.onPressed,
    required this.onRetry,
  });

  final HeroState hero;

  /// Empty 카드(와 안의 업로드 버튼)를 눌렀을 때.
  final VoidCallback onPressed;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: switch (hero) {
        HeroLoading() => const _MessageCard(
          id: HomeTestIds.heroLoading,
          message: Copy.homeTopicLoading,
          busy: true,
        ),
        HeroNoOpenTopic() => const _MessageCard(
          id: HomeTestIds.heroNoOpenTopic,
          message: Copy.homeHeroNoTopic,
        ),
        HeroEmpty(:final topicTitle) => _EmptyCard(
          topicTitle: topicTitle,
          onPressed: onPressed,
        ),
        HeroProcessing() => const _MessageCard(
          id: HomeTestIds.heroProcessing,
          message: Copy.homeHeroProcessing,
          busy: true,
        ),
        HeroPhoto(:final thumbnailUrl, :final pending) => _PhotoCard(
          thumbnailUrl: thumbnailUrl,
          pending: pending,
        ),
        HeroError() => _ErrorCard(onRetry: onRetry),
      },
    );
  }
}

class _CardFrame extends StatelessWidget {
  const _CardFrame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 4 / 3,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: child,
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({
    required this.id,
    required this.message,
    this.busy = false,
  });

  final String id;
  final String message;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return TestId(
      id,
      child: _CardFrame(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (busy) ...[
                const SizedBox.square(
                  dimension: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(height: 12),
              ],
              Text(message, textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.topicTitle, required this.onPressed});

  final String? topicTitle;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final title = topicTitle;
    final message = title == null
        ? Copy.homeHeroNoTopic
        : Copy.fill(Copy.homeHeroEmpty, {'주제': title});
    return TestId(
      HomeTestIds.heroEmpty,
      // 카드 어디를 눌러도 업로드로 가지만 접근성에는 안의 버튼 하나만 노출한다.
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        excludeFromSemantics: true,
        onTap: onPressed,
        child: _CardFrame(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text(message, textAlign: TextAlign.center),
                ),
                const SizedBox(height: 16),
                TestId.button(
                  HomeTestIds.heroUploadButton,
                  child: IconButton.filled(
                    icon: const Icon(Icons.add),
                    tooltip: Copy.navTabUploadA11y,
                    onPressed: onPressed,
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

class _PhotoCard extends StatelessWidget {
  const _PhotoCard({required this.thumbnailUrl, required this.pending});

  final String? thumbnailUrl;
  final bool pending;

  @override
  Widget build(BuildContext context) {
    return TestId(
      HomeTestIds.heroPhoto,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: AspectRatio(
          aspectRatio: 4 / 3,
          child: Stack(
            fit: StackFit.expand,
            children: [
              AppNetworkImage(url: thumbnailUrl),
              if (pending)
                const Positioned(
                  top: 12,
                  left: 12,
                  child: TestId(
                    HomeTestIds.heroPendingBadge,
                    child: _Badge(label: Copy.homeHeroPendingBadge),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Text(
          label,
          style: const TextStyle(color: Colors.white, fontSize: 12),
        ),
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return TestId(
      HomeTestIds.heroError,
      child: _CardFrame(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(Copy.homeHeroError, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              TestId.button(
                HomeTestIds.heroRetryButton,
                child: TextButton(
                  onPressed: onRetry,
                  child: const Text(Copy.homeHeroRetry),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
