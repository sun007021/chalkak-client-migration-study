import 'package:flutter/widgets.dart';

import '../../like/domain/toast_message.dart';
import 'feed_view_model.dart';

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
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
