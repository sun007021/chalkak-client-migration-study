// ignore_for_file: unused_field
import 'package:flutter/widgets.dart';

import '../../../core/ui/toast/toast_controller.dart';
import '../../home/domain/home_view_model.dart';
import '../../home/presentation/home_screen.dart';
import '../domain/main_shell_view_model.dart';
import 'main_shell_navigator.dart';

/// 메인 화면: 탭 본문 + 하단 바(홈, 전시, 가운데 업로드, 기록, 설정).
/// - 하단 바 `bottom-bar.root`, 탭 `bottom-bar.tab-*`(선택된 탭만 selected), 업로드 버튼
///   `bottom-bar.upload-button`(selected 없음, 접근성 이름 Copy.navTabUploadA11y, 아이콘 "+").
/// - 탭 본문: 홈은 [HomeScreen](`home.root`), 전시·기록·설정은 자리표시자(`display.root`,
///   `record.root`, `settings.root`)이며 한 번 만든 뒤 탭을 오가도 상태를 유지한다(REQ-NAV-005).
/// - 업로드 게이트 확인 중에는 `upload-entry.loading`을 보인다.
/// - [HomeViewModel] 이벤트를 [MainShellViewModel]/[MainShellNavigator]로 연결한다:
///   OpenUploadGate -> onUploadPressed, OpenRecordTab -> openRecord, OpenDisplayTab ->
///   openDisplay, OpenFeed/OpenBanner/OpenNotifications -> navigator(진행 중 중복 무시).
///   알림함이 닫히면 `home.refreshUnread()`.
/// - 앱이 포그라운드로 돌아오면 홈이 보이는 중일 때 `home.onForeground()`, 홈 탭으로 돌아오면
///   `home.onBecameVisible()`.
/// - [ToastHost]로 토스트를 그린다.
class MainShell extends StatefulWidget {
  const MainShell({
    super.key,
    required this.shell,
    required this.home,
    required this.navigator,
    required this.toast,
    required this.aiCardBuilder,
  });

  final MainShellViewModel shell;
  final HomeViewModel home;
  final MainShellNavigator navigator;
  final ToastController toast;
  final HomeAiCardBuilder aiCardBuilder;

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
