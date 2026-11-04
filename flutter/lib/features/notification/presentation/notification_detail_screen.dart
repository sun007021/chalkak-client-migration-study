import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/components/chalkak_button.dart';
import '../../../core/ui/components/chalkak_nav_button.dart';
import '../../../core/ui/components/chalkak_states.dart';
import '../../../core/ui/test_id.dart';
import '../domain/notification_models.dart';
import 'notification_detail_view_model.dart';
import 'notification_test_ids.dart';

/// 알림 상세 화면(단독 위젯).
/// testids.md `notification-detail.*`: 루트, 제목 바 "알림 상세", 뒤로, 알림 제목·본문,
/// 상태에 따라 `loading` / `not-found-state`(`Copy.notiGone`) / `error-state`(+`retry-button`)는 해당 상태일 때만.
/// 원본 사진 `photo`와 "반려 사유" 섹션(`rejection-section`, `rejection-reason`)은 값이 있을 때만 존재하고
/// (NOTICE는 둘 다 없다), "알림함으로" 버튼 `back-to-inbox-button`은 `POST_REJECTED`에서만 존재한다.
/// 반려 사유 500자는 줄바꿈과 스크롤로 전문이 보인다. "새로 올리기" 버튼은 없다.
class NotificationDetailScreen extends StatelessWidget {
  const NotificationDetailScreen({
    super.key,
    required this.viewModel,
    required this.onBack,
  });

  final NotificationDetailViewModel viewModel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return TestId(
      NotificationTestIds.detailRoot,
      child: Material(
        color: Theme.of(context).scaffoldBackgroundColor,
        child: SafeArea(
          child: ListenableBuilder(
            listenable: viewModel,
            builder: (context, _) {
              final state = viewModel.state;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _TitleBar(onBack: onBack),
                  Expanded(child: _body(context, state)),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, NotificationDetailState state) {
    switch (state.status) {
      case DetailStatus.loading:
        return const TestId(
          NotificationTestIds.detailLoading,
          child: Center(child: ChalkakSpinner()),
        );
      case DetailStatus.notFound:
        return const TestId(
          NotificationTestIds.detailNotFound,
          child: Center(child: ChalkakStatusText(Copy.notiGone)),
        );
      case DetailStatus.error:
        return TestId(
          NotificationTestIds.detailError,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ChalkakStatusText(
                  state.errorMessage ?? Copy.notiDetailError,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                TestId.button(
                  NotificationTestIds.detailRetryButton,
                  child: ChalkakOutlinedButton(
                    onPressed: () => unawaited(viewModel.retry()),
                    label: Copy.notiInboxRetry,
                    fillsWidth: false,
                  ),
                ),
              ],
            ),
          ),
        );
      case DetailStatus.content:
        final detail = state.detail;
        if (detail == null) return const SizedBox.shrink();
        return _Content(
          detail: detail,
          onBackToInbox: () => unawaited(viewModel.onBackToInboxPressed()),
        );
    }
  }
}

class _TitleBar extends StatelessWidget {
  const _TitleBar({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        TestId.button(
          NotificationTestIds.detailBackButton,
          child: ChalkakNavButton.back(onPressed: onBack),
        ),
        Expanded(
          child: TestId(
            NotificationTestIds.detailScreenTitle,
            child: Text(
              Copy.notiDetailTitle,
              style: context.tokens.text.headline.copyWith(
                color: context.tokens.colors.textPrimary,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.detail, required this.onBackToInbox});

  final NotificationDetail detail;
  final VoidCallback onBackToInbox;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final photo = detail.originalImageUrl;
    final reason = detail.rejectionReason;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        tokens.spacing.screenHorizontal,
        tokens.spacing.lg,
        tokens.spacing.screenHorizontal,
        tokens.spacing.xl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TestId(
            NotificationTestIds.detailTitle,
            child: Text(
              detail.title,
              style: tokens.text.headline.copyWith(
                color: tokens.colors.textPrimary,
              ),
            ),
          ),
          SizedBox(height: tokens.spacing.sm),
          if (photo != null) ...[
            TestId(
              NotificationTestIds.detailPhoto,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(tokens.radius.photoCard),
                child: ColoredBox(
                  color: tokens.colors.surface,
                  child: SizedBox(
                    height: 320,
                    child: AppNetworkImage(url: photo, fit: BoxFit.contain),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          TestId(
            NotificationTestIds.detailBody,
            child: Text(
              detail.body,
              style: tokens.text.subheadline.copyWith(
                color: tokens.colors.textSecondary,
              ),
            ),
          ),
          if (reason != null && reason.isNotEmpty) ...[
            const SizedBox(height: 20),
            TestId(
              NotificationTestIds.detailRejectionSection,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    Copy.notiDetailReason,
                    style: tokens.text.caption.copyWith(
                      color: tokens.colors.textInactive,
                    ),
                  ),
                  SizedBox(height: tokens.spacing.sm),
                  TestId(
                    NotificationTestIds.detailRejectionReason,
                    child: Text(
                      reason,
                      style: tokens.text.body.copyWith(
                        color: tokens.colors.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (detail.type == NotificationType.postRejected) ...[
            const SizedBox(height: 24),
            TestId.button(
              NotificationTestIds.detailBackToInboxButton,
              child: ChalkakButton(
                onPressed: onBackToInbox,
                label: Copy.notiDetailToInbox,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
