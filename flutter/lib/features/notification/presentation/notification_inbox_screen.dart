import 'package:flutter/widgets.dart';

import 'notification_inbox_view_model.dart';

/// 알림함 화면(단독 위젯). 라우트 연결은 통합 단계에서 한다.
/// testids.md `notifications.*`([NotificationTestIds]):
/// 루트 `root`, 뒤로 `back-button`, 제목 `Copy.notiInboxTitle`,
/// 상태에 따라 `loading`(+`Copy.notiInboxLoading`) / `empty-state`(+`notiInboxEmptyTitle`·`notiInboxEmptyBody`) /
/// `error-state`(+오류 문구, `retry-button` "다시 시도") / `list`는 해당 상태일 때만 존재한다.
/// 행 `item-{id}`(제목·본문·시각·썸네일(없으면 대체 이미지)), 미읽음 표시 `item-unread-{id}`는 readAt이 null일 때만.
/// 다음 페이지 요청 중 `load-more-indicator`, 당겨서 새로고침 중 `refresh-indicator`.
/// 스크롤로 새로 만들어진 마지막 항목 index를 `onVisibleIndexChanged`로 알린다.
class NotificationInboxScreen extends StatelessWidget {
  const NotificationInboxScreen({
    super.key,
    required this.viewModel,
    required this.onBack,
  });

  final NotificationInboxViewModel viewModel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
