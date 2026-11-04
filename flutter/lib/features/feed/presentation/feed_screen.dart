import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/text/code_points.dart';
import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/components/chalkak_dialog.dart';
import '../../../core/ui/components/chalkak_icon.dart';
import '../../../core/ui/components/chalkak_nav_button.dart';
import '../../../core/ui/components/chalkak_skeleton.dart';
import '../../../core/ui/components/chalkak_text_field.dart';
import '../../../core/ui/test_id.dart';
import '../../like/domain/toast_message.dart';
import '../../like/presentation/like_button.dart';
import 'feed_test_ids.dart';
import 'feed_view_model.dart';
import 'signed_photo.dart';
import 'zoomable_photo.dart';

/// 게시물 상세 화면(단독 위젯). 하단바 숨김·라우트 연결은 통합 단계에서 한다.
///
/// - mounted인 동안만 `viewModel.events`를 구독해 [FeedToast]는 [onToast], [FeedClose]는 [onClose].
/// - 상태별로 `feed.loading` / `feed.not-found-state`(+`Copy.feedErrorNotFound`) /
///   `feed.error-state`(+`feed.retry-button`) / 콘텐츠. 해당 상태일 때만 트리에 존재한다.
/// - 콘텐츠: `feed.back-button`(→ [onClose]), `feed.photo`, 사인 `feed.signature-image`(사인 URL이 있을 때),
///   `feed.date-label`, `feed.title`(null이면 "무제"), `LikeButton`(`feed.like-button`·`feed.like-count`,
///   enabled = likeEnabled), 수정 `feed.edit-title-button`(canEditTitle일 때만), 삭제
///   `feed.delete-button`(canDelete일 때만), 삭제 중 `feed.deleting`.
/// - 수정 버튼 → `feed.title-dialog`: 현재 제목 미리 채움(없으면 빈 칸), 플레이스홀더, `feed.title-input`
///   (`PostTitleInputFormatter`), `feed.title-cancel-button`·`feed.title-save-button`. 저장 중에는
///   `feed.title-saving`과 "저장 중..." 비활성. 성공하면 닫고, 실패하면 열어 둔 채 titleError를 보여 준다.
/// - 삭제 버튼 → `feed.delete-dialog`(제목·본문·`feed.delete-cancel-button`·`feed.delete-confirm-button`).
///   취소는 요청 없음, 확인은 `confirmDelete`.
/// - [aiSlot]은 AI 피드백 알약 자리(다른 PR이 채운다).
///
/// 상세 응답 전(시드만 보이는 동안)에는 수정·삭제 버튼을 보이되 누를 수 없다. 좋아요 토스트는
/// 이 화면이 아니라 `LikeStore.toasts`로 나간다. 이 화면은 `load`를 부르지 않는다(연결 단계에서 부른다).
class FeedScreen extends StatefulWidget {
  const FeedScreen({
    super.key,
    required this.viewModel,
    required this.onToast,
    required this.onClose,
    this.aiSlot,
  });

  final FeedViewModel viewModel;
  final ValueChanged<ToastMessage> onToast;
  final VoidCallback onClose;
  final Widget? aiSlot;

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  StreamSubscription<FeedEvent>? _events;

  @override
  void initState() {
    super.initState();
    _listen();
  }

  @override
  void didUpdateWidget(FeedScreen oldWidget) {
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
    super.dispose();
  }

  void _onEvent(FeedEvent event) {
    if (!mounted) return;
    switch (event) {
      case FeedToast(:final message):
        widget.onToast(message);
      case FeedClose():
        widget.onClose();
    }
  }

  /// 짧게 나타나고 사라지는 다이얼로그(닫은 직후 화면이 바로 정리된다).
  Future<T?> _showDialog<T>({
    required WidgetBuilder builder,
    bool barrierDismissible = true,
  }) {
    return showGeneralDialog<T>(
      context: context,
      barrierDismissible: barrierDismissible,
      barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
      barrierColor: context.tokens.colors.scrim,
      transitionDuration: const Duration(milliseconds: 80),
      pageBuilder: (context, _, _) => builder(context),
      transitionBuilder: (context, animation, _, child) =>
          FadeTransition(opacity: animation, child: child),
    );
  }

  Future<void> _editTitle() async {
    final viewModel = widget.viewModel;
    await _showDialog<void>(
      barrierDismissible: false,
      builder: (_) => _TitleDialog(
        viewModel: viewModel,
        initialTitle: viewModel.state.content?.title ?? '',
      ),
    );
    viewModel.clearTitleError();
  }

  Future<void> _confirmDelete() async {
    final confirmed = await _showDialog<bool>(
      builder: (_) => const _DeleteDialog(),
    );
    if (confirmed ?? false) await widget.viewModel.confirmDelete();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = widget.viewModel;
    return TestId(
      FeedTestIds.root,
      child: Material(
        color: context.tokens.colors.background,
        child: SafeArea(
          child: ListenableBuilder(
            listenable: viewModel,
            builder: (context, _) {
              final state = viewModel.state;
              // 상세 응답이 확정되기 전에는 수정·삭제를 누를 수 없다(REQ-FEED-009, TC-FEED-012).
              final actionable = state.isConfirmed && !state.isDeleting;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // 상단 바(FeedTopBar): 좌우 lg, 위아래 md. 왼쪽 뒤로, 오른쪽 수정(ic_edit)·삭제(ic_delete).
                  Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: context.tokens.spacing.lg - 4,
                      vertical: context.tokens.spacing.md - 4,
                    ),
                    child: Row(
                      children: [
                        TestId.button(
                          FeedTestIds.backButton,
                          child: ChalkakNavButton.back(
                            onPressed: widget.onClose,
                          ),
                        ),
                        const Spacer(),
                        if (state.status == FeedStatus.content &&
                            state.canEditTitle)
                          TestId.button(
                            FeedTestIds.editTitleButton,
                            child: _TopIconButton(
                              icon: ChalkakIcon.edit,
                              color: context.tokens.colors.actionPrimary,
                              label: Copy.feedEditTitle,
                              onPressed: actionable ? _editTitle : null,
                            ),
                          ),
                        if (state.status == FeedStatus.content &&
                            state.canDelete)
                          TestId.button(
                            FeedTestIds.deleteButton,
                            child: _TopIconButton(
                              icon: ChalkakIcon.delete,
                              color: context.tokens.colors.error,
                              label: Copy.feedDeleteTitle,
                              onPressed: actionable ? _confirmDelete : null,
                            ),
                          ),
                      ],
                    ),
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

  Widget _body(FeedState state) => switch (state.status) {
    FeedStatus.loading => _Loading(imageUrl: state.loadingImageUrl),
    FeedStatus.notFound => const TestId(
      FeedTestIds.notFoundState,
      child: Center(child: Text(Copy.feedErrorNotFound)),
    ),
    FeedStatus.error => _ErrorBody(
      text: state.errorText ?? Copy.feedErrorLoad,
      onRetry: widget.viewModel.retry,
    ),
    FeedStatus.content => _Content(
      state: state,
      aiSlot: widget.aiSlot,
      onLike: widget.viewModel.onLikeTapped,
    ),
  };
}

class _Loading extends StatelessWidget {
  const _Loading({this.imageUrl});

  /// 기록에서 넘겨받은 썸네일. 있으면 응답 전에 먼저 보여 준다.
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl;
    return TestId(
      FeedTestIds.loading,
      child: url != null
          ? AppNetworkImage(url: url, fit: BoxFit.contain)
          : const ChalkakSkeleton(),
    );
  }
}

/// 상단 바 아이콘 버튼: 48 터치, 아이콘 24. 비활성이면 흐리게 한다.
class _TopIconButton extends StatelessWidget {
  const _TopIconButton({
    required this.icon,
    required this.color,
    required this.label,
    required this.onPressed,
  });

  final String icon;
  final Color color;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: onPressed != null,
      label: label,
      excludeSemantics: true,
      onTap: onPressed,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: SizedBox.square(
          dimension: 48,
          child: Center(
            child: Opacity(
              opacity: onPressed == null ? 0.4 : 1,
              child: ChalkakIcon(icon, size: 24, color: color),
            ),
          ),
        ),
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
    final tokens = context.tokens;
    return TestId(
      FeedTestIds.errorState,
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
              FeedTestIds.retryButton,
              child: TextButton(
                onPressed: onRetry,
                child: Text(
                  Copy.commonRetry,
                  style: tokens.text.body.copyWith(
                    color: tokens.colors.actionPrimary,
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

class _Content extends StatelessWidget {
  const _Content({
    required this.state,
    required this.aiSlot,
    required this.onLike,
  });

  final FeedState state;
  final Widget? aiSlot;
  final VoidCallback onLike;

  @override
  Widget build(BuildContext context) {
    final content = state.content!;
    final tokens = context.tokens;
    final dateLabel = state.dateLabel;
    final signatureUrl = content.signatureImageUrl;
    return Stack(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 주제 날짜 라벨(FeedTopic): 좌우 screenHorizontal, 위 lg, subheadline textPrimary.
            Padding(
              padding: EdgeInsets.fromLTRB(
                tokens.spacing.screenHorizontal,
                tokens.spacing.lg,
                tokens.spacing.screenHorizontal,
                tokens.spacing.md,
              ),
              child: dateLabel == null
                  ? Text(' ', style: tokens.text.subheadline)
                  : TestId(
                      FeedTestIds.dateLabel,
                      child: Text(
                        dateLabel,
                        style: tokens.text.subheadline.copyWith(
                          color: tokens.colors.textPrimary,
                        ),
                      ),
                    ),
            ),
            Expanded(
              child: TestId(
                FeedTestIds.photo,
                child: ZoomablePhoto(
                  child: SignedPhoto(
                    photoUrl: content.originalImageUrl,
                    signatureUrl: signatureUrl,
                    semanticLabel: state.photoLabel,
                  ),
                ),
              ),
            ),
            // 좋아요 행(FeedLikeRow): 높이 57, 좌우 14, 왼쪽 하트 24 + 수, 오른쪽 제목(textSecondary), 바닥 border.
            DecoratedBox(
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: tokens.colors.border, width: 0.5),
                ),
              ),
              child: SizedBox(
                height: 57,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: Row(
                    children: [
                      LikeButton(
                        buttonId: FeedTestIds.likeButton,
                        countId: FeedTestIds.likeCount,
                        isLiked: content.isLiked,
                        likeCount: content.likeCount,
                        enabled: state.likeEnabled,
                        onPressed: onLike,
                      ),
                      if (aiSlot != null) ...[
                        SizedBox(width: tokens.spacing.md),
                        aiSlot!,
                      ],
                      SizedBox(width: tokens.spacing.md),
                      Expanded(
                        child: TestId(
                          FeedTestIds.title,
                          child: Text(
                            state.displayTitle,
                            maxLines: 1,
                            textAlign: TextAlign.end,
                            overflow: TextOverflow.ellipsis,
                            style: tokens.text.body.copyWith(
                              color: tokens.colors.textSecondary,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
        if (state.isDeleting)
          Positioned.fill(
            child: TestId(
              FeedTestIds.deleting,
              child: ColoredBox(
                color: tokens.colors.scrim,
                child: const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// 제목 수정 다이얼로그. 저장이 실패하면 열어 둔 채 사유를 보여 준다.
class _TitleDialog extends StatefulWidget {
  const _TitleDialog({required this.viewModel, required this.initialTitle});

  final FeedViewModel viewModel;
  final String initialTitle;

  @override
  State<_TitleDialog> createState() => _TitleDialogState();
}

class _TitleDialogState extends State<_TitleDialog> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initialTitle,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final result = await widget.viewModel.saveTitle(_controller.text);
    if (!mounted) return;
    if (result != TitleSaveResult.failed) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.viewModel,
      builder: (context, _) {
        final state = widget.viewModel.state;
        final saving = state.isSavingTitle;
        final error = state.titleError;
        return TestId(
          FeedTestIds.titleDialog,
          child: ChalkakDialog(
            title: Copy.feedEditTitle,
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 8),
                TestId(
                  FeedTestIds.titleInput,
                  child: ChalkakTextField(
                    controller: _controller,
                    enabled: !saving,
                    autofocus: true,
                    style: context.tokens.text.subheadline,
                    inputFormatters: [PostTitleInputFormatter()],
                    hintText: Copy.feedEditPlaceholder,
                  ),
                ),
                if (error != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    error,
                    style: context.tokens.text.footnote.copyWith(
                      color: context.tokens.colors.error,
                    ),
                  ),
                ],
                if (saving)
                  const TestId(
                    FeedTestIds.titleSaving,
                    child: Padding(
                      padding: EdgeInsets.only(top: 12),
                      child: LinearProgressIndicator(minHeight: 2),
                    ),
                  ),
              ],
            ),
            actions: [
              TestId.button(
                FeedTestIds.titleCancelButton,
                child: ChalkakDialogButton(
                  kind: ChalkakDialogButtonKind.cancel,
                  label: Copy.feedEditCancel,
                  onPressed: saving ? null : () => Navigator.of(context).pop(),
                ),
              ),
              TestId.button(
                FeedTestIds.titleSaveButton,
                child: ChalkakDialogButton(
                  label: saving ? Copy.feedEditSaving : Copy.feedEditSave,
                  onPressed: saving ? null : _save,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _DeleteDialog extends StatelessWidget {
  const _DeleteDialog();

  @override
  Widget build(BuildContext context) {
    return TestId(
      FeedTestIds.deleteDialog,
      child: ChalkakDialog(
        title: Copy.feedDeleteTitle,
        message: Copy.feedDeleteBody,
        actions: [
          TestId.button(
            FeedTestIds.deleteCancelButton,
            child: ChalkakDialogButton(
              kind: ChalkakDialogButtonKind.cancel,
              label: Copy.feedDeleteCancel,
              onPressed: () => Navigator.of(context).pop(false),
            ),
          ),
          TestId.button(
            FeedTestIds.deleteConfirmButton,
            child: ChalkakDialogButton(
              kind: ChalkakDialogButtonKind.destructive,
              label: Copy.feedDeleteConfirm,
              onPressed: () => Navigator.of(context).pop(true),
            ),
          ),
        ],
      ),
    );
  }
}
