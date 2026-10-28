import 'package:flutter/widgets.dart';

import 'notification_detail_view_model.dart';

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
  Widget build(BuildContext context) => throw UnimplementedError();
}
