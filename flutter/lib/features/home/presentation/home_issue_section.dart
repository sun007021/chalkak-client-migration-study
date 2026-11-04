import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/components/chalkak_states.dart';
import '../../../core/ui/test_id.dart';
import '../../banner/domain/banner_models.dart';
import 'home_test_ids.dart';

/// ISSUE 머리글. 배너가 1건 이상일 때만 그리며 `home.issue-section`이 이 머리글에 붙는다
/// (목록은 지연 생성이라 카드 전체를 한 위젯으로 감쌀 수 없다).
class HomeIssueHeader extends StatelessWidget {
  const HomeIssueHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return TestId(
      HomeTestIds.issueSection,
      child: Padding(
        // ISSUE 헤더: 위 xxl, 아래 lg, headline bold.
        padding: EdgeInsets.fromLTRB(
          context.tokens.spacing.screenHorizontal,
          context.tokens.spacing.xxl,
          context.tokens.spacing.screenHorizontal,
          context.tokens.spacing.lg,
        ),
        child: Text(
          Copy.homeBannerTitle,
          style: context.tokens.text.headline.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

/// 최초 조회 실패 때 ISSUE 자리에 보이는 오류와 다시 시도.
class HomeIssueError extends StatelessWidget {
  const HomeIssueError({super.key, required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        context.tokens.spacing.screenHorizontal,
        context.tokens.spacing.xxl,
        context.tokens.spacing.screenHorizontal,
        0,
      ),
      child: Row(
        children: [
          const Expanded(
            child: TestId(
              HomeTestIds.issueError,
              child: ChalkakStatusText(Copy.homeBannerError),
            ),
          ),
          TestId.button(
            HomeTestIds.issueRetryButton,
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

/// 배너 카드 하나(썸네일, 제목, 부제목). 카드 전체가 하나의 버튼이다.
class HomeIssueCard extends StatefulWidget {
  const HomeIssueCard({
    super.key,
    required this.item,
    required this.index,
    required this.onPressed,
    required this.onVisible,
  });

  final BannerItem item;
  final int index;
  final VoidCallback onPressed;

  /// 카드가 처음 만들어진(=목록에 보이기 시작한) 다음 프레임에 한 번 부른다.
  final void Function(int index) onVisible;

  @override
  State<HomeIssueCard> createState() => _HomeIssueCardState();
}

class _HomeIssueCardState extends State<HomeIssueCard> {
  @override
  void initState() {
    super.initState();
    // 빌드 중에 상태를 바꾸면 안 되므로 프레임이 끝난 뒤 알린다.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onVisible(widget.index);
    });
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final tokens = context.tokens;
    return Padding(
      // 배너 하나: 좌우 screenHorizontal, 아래 xxl(HomeIssueSection.swift).
      padding: EdgeInsets.fromLTRB(
        tokens.spacing.screenHorizontal,
        0,
        tokens.spacing.screenHorizontal,
        tokens.spacing.xxl,
      ),
      child: Semantics(
        key: Key(HomeTestIds.issueItem(item.id)),
        identifier: HomeTestIds.issueItem(item.id),
        container: true,
        button: true,
        label: '${item.title}\n${item.subtitle}',
        onTap: widget.onPressed,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onPressed,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(tokens.radius.large),
                child: ColoredBox(
                  color: tokens.colors.surfaceElevated,
                  child: AspectRatio(
                    aspectRatio: 1672 / 941,
                    child: AppNetworkImage(url: item.thumbnailUrl?.toString()),
                  ),
                ),
              ),
              SizedBox(height: tokens.spacing.lg),
              Text(
                item.title,
                style: tokens.text.subheadline.copyWith(
                  color: tokens.colors.textPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              SizedBox(height: tokens.spacing.sm),
              Text(
                item.subtitle,
                style: tokens.text.caption.copyWith(
                  color: tokens.colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
