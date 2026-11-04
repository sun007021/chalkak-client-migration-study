import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/components/chalkak_states.dart';
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
      padding: EdgeInsets.symmetric(
        horizontal: context.tokens.spacing.screenHorizontal,
      ),
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

/// 히어로 카드 틀: 비율 5:6, 라운드 photoCard(12) 클립 (HomeHeroCard.swift Metrics.aspectRatio).
const double _heroAspectRatio = 5 / 6;

class _CardFrame extends StatelessWidget {
  const _CardFrame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final shape = BorderRadius.circular(tokens.radius.photoCard);
    return AspectRatio(
      aspectRatio: _heroAspectRatio,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: tokens.colors.surface,
          borderRadius: shape,
          border: Border.all(color: tokens.colors.border),
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
    final tokens = context.tokens;
    return TestId(
      id,
      child: _CardFrame(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                message,
                textAlign: TextAlign.center,
                style: tokens.text.subheadline.copyWith(
                  color: tokens.colors.textSecondary,
                ),
              ),
              if (busy) ...[
                SizedBox(height: tokens.spacing.md),
                const ChalkakSpinner(size: 24),
              ],
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

  // HomeHeroCard.swift Metrics: addButtonSize 36, addIconSize 22.
  static const _addButtonSize = 36.0;
  static const _addIconSize = 22.0;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
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
                  padding: EdgeInsets.symmetric(horizontal: tokens.spacing.xl),
                  child: Text(
                    message,
                    textAlign: TextAlign.center,
                    style: tokens.text.subheadline.copyWith(
                      color: tokens.colors.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                SizedBox(height: tokens.spacing.xl),
                TestId.button(
                  HomeTestIds.heroUploadButton,
                  child: Semantics(
                    button: true,
                    label: Copy.navTabUploadA11y,
                    excludeSemantics: true,
                    onTap: onPressed,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: onPressed,
                      child: SizedBox.square(
                        dimension: 48,
                        child: Center(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: tokens.colors.actionPrimary,
                              shape: BoxShape.circle,
                            ),
                            child: SizedBox.square(
                              dimension: _addButtonSize,
                              child: Icon(
                                Icons.add_rounded,
                                size: _addIconSize,
                                color: tokens.colors.onActionPrimary,
                              ),
                            ),
                          ),
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

class _PhotoCard extends StatelessWidget {
  const _PhotoCard({required this.thumbnailUrl, required this.pending});

  final String? thumbnailUrl;
  final bool pending;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return TestId(
      HomeTestIds.heroPhoto,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(tokens.radius.photoCard),
        child: AspectRatio(
          aspectRatio: _heroAspectRatio,
          child: ColoredBox(
            color: tokens.colors.surfaceElevated,
            child: Stack(
              fit: StackFit.expand,
              children: [
                AppNetworkImage(url: thumbnailUrl),
                if (pending)
                  Positioned(
                    top: tokens.spacing.md,
                    right: tokens.spacing.md,
                    child: const TestId(
                      HomeTestIds.heroPendingBadge,
                      child: _Badge(label: Copy.homeHeroPendingBadge),
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

/// 검수 대기 배지: caption semibold, textOnImage, scrim 캡슐, 가로 md 세로 xs.
class _Badge extends StatelessWidget {
  const _Badge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return DecoratedBox(
      decoration: ShapeDecoration(
        color: tokens.colors.scrim,
        shape: const StadiumBorder(),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: tokens.spacing.md,
          vertical: tokens.spacing.xs,
        ),
        child: Text(
          label,
          style: tokens.text.caption.copyWith(
            color: tokens.colors.textOnImage,
            fontWeight: FontWeight.w600,
          ),
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
    final tokens = context.tokens;
    return TestId(
      HomeTestIds.heroError,
      child: _CardFrame(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                Copy.homeHeroError,
                textAlign: TextAlign.center,
                style: tokens.text.subheadline.copyWith(
                  color: tokens.colors.textSecondary,
                ),
              ),
              SizedBox(height: tokens.spacing.md),
              TestId.button(
                HomeTestIds.heroRetryButton,
                child: Semantics(
                  button: true,
                  label: Copy.homeHeroRetry,
                  excludeSemantics: true,
                  onTap: onRetry,
                  child: ChalkakRetryCircleButton(onPressed: onRetry),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
