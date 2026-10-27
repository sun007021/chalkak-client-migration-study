import 'package:flutter/widgets.dart';

import '../../feed/domain/feed_target.dart';
import '../../like/domain/toast_message.dart';
import 'display_view_model.dart';

/// 전시 탭 화면(단독 위젯). 탭·라우트 연결은 통합 단계에서 한다.
///
/// - 좋아요 실패·게스트 토스트는 이 화면이 아니라 `LikeStore.toasts`로 나간다(앱의 토스트 호스트가 한 곳에서
///   구독한다. 전시와 상세가 동시에 떠 있어도 토스트가 두 번 뜨지 않게 하려는 것이다).
/// - 이미지는 `errorBuilder`를 둔다(위젯 테스트의 네트워크 이미지는 실패한다).
/// - 화면이 mounted인 동안만 `viewModel.events`를 구독해 [DisplayToast]는 [onToast],
///   [DisplayOpenFeed]는 [onOpenFeed], [DisplayScrollToTop]은 그리드를 맨 위로 보낸다.
/// - [DisplayState.status]에 따라 `display.loading` / `display.empty-state`(+`Copy.displayEmpty`) /
///   `display.error-state`(+`display.retry-button`) / 콘텐츠를 그린다. 해당 상태일 때만 트리에 존재한다.
/// - 머리글: `display.date-label`, `display.prev-date-button`·`next-date-button`(enabled는 canGoPrevious/Next),
///   `display.date-picker-button`(누르면 [DatePickerSheet]를 열고 확인 시 `selectDate`),
///   `display.topic-title`, `display.description`.
/// - 정렬 탭 3개(selected 노출)는 `showSortTabs`일 때만. 아카이브면 `display.featured-pager`와
///   `display.featured-item-{postId}`. 그리드 항목 `display.item-{postId}`(탭 → `onPostTapped`),
///   하트 `display.like-button-{postId}`·수 `display.like-count-{postId}`(탭 → `onLikeTapped`).
/// - 스크롤이 끝에 가까워지면 `onVisibleIndexChanged(마지막으로 보인 index)`를 부른다.
class DisplayScreen extends StatefulWidget {
  const DisplayScreen({
    super.key,
    required this.viewModel,
    required this.onToast,
    required this.onOpenFeed,
  });

  final DisplayViewModel viewModel;
  final ValueChanged<ToastMessage> onToast;
  final ValueChanged<FeedTarget> onOpenFeed;

  @override
  State<DisplayScreen> createState() => _DisplayScreenState();
}

class _DisplayScreenState extends State<DisplayScreen> {
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
