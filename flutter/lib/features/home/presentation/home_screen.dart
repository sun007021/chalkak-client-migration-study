// ignore_for_file: unused_field
import 'package:flutter/widgets.dart';

import '../domain/home_view_model.dart';

/// AI 피드백 카드 자리. AIR PR이 실제 카드를 주입한다. 홈은 [postId]가 있을 때만 이 빌더를
/// 호출해 `home.ai-card` 영역에 넣는다(REQ-HOME-034).
typedef HomeAiCardBuilder = Widget Function(
  BuildContext context,
  String postId,
);

/// 홈 탭 화면. [HomeViewModel.state]를 그리기만 한다. 루트는 `home.root`.
/// 섹션과 요소는 testids.md 홈 절의 id를 쓰고, 상태 표시 요소는 해당 상태일 때만 트리에 둔다.
/// - 상단: `home.notification-button`, 미읽음이면 `home.notification-unread-dot`
/// - 머리글: `home.topic-date`("M월 d일 · 오늘의 주제"), `home.topic-title`
/// - 히어로: 상태별 `home.hero-*`(Empty는 `home.hero-upload-button` 포함)
/// - 이번 주: `home.week-section`, 일~토 `home.week-day-{date}`, 기록이 있는 날 `home.week-photo-{date}`
/// - 랭킹: `home.ranking-*`, `home.popular-*`, 더보기 링크, 빈 상태 `home.ranking-empty`
/// - 배너: `home.issue-section`(0건·오류면 없음), 카드 `home.issue-item-{bannerId}`
/// - `home.scroll`: 스크롤 영역. 새로고침 중에는 `home.refresh-indicator`가 보인다.
/// 이미지는 로드 실패해도 항목만 대체 표시하고 위젯 트리를 깨지 않는다(errorBuilder).
class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.viewModel,
    required this.aiCardBuilder,
    this.scrollController,
  });

  final HomeViewModel viewModel;
  final HomeAiCardBuilder aiCardBuilder;

  /// 셸이 맨 위 스크롤(탭 재선택)을 하려고 넘기는 컨트롤러.
  final ScrollController? scrollController;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
