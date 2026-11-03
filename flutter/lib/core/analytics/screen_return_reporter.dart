import 'dart:async';

import 'package:flutter/widgets.dart';

/// 라우터(Navigator) 하나에 붙이는 관찰자. 페이지 라우트가 닫혀 아래 라우트가 다시 보일 때
/// [ScreenReturnReporter]에 알린다. 다이얼로그·시트(PopupRoute)는 화면 전환이 아니라 제외한다.
/// NavigatorObserver는 Navigator 하나에만 붙을 수 있으므로 라우터마다 새로 만들고
/// [ScreenReturnScope]로 아래 위젯에 내려 준다(전역 싱글턴 아님).
///
/// 감지 범위는 pop(`pop`·`maybePop`·`popUntil`)이다. go_router `go()`는 스택을 새 페이지로 통째로
/// 바꿔 화면이 새로 만들어지며 스스로 보고하고, `pushReplacement`는 위 화면만 바꿔 아래 화면이
/// 드러나지 않는다. 이 앱에는 `didRemove`/`didReplace`로 아래 화면이 드러나는 경로가 없다.
/// 그런 경로를 추가하면 이 관찰자가 그 콜백도 처리해야 한다.
class ScreenReturnObserver extends RouteObserver<PageRoute<dynamic>> {}

/// [ScreenReturnObserver]를 [ScreenReturnReporter]에 전달한다. 없으면 복귀 보고를 하지 않는다.
class ScreenReturnScope extends InheritedWidget {
  const ScreenReturnScope({
    super.key,
    required this.observer,
    required super.child,
  });

  final ScreenReturnObserver observer;

  static ScreenReturnObserver? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ScreenReturnScope>()?.observer;

  @override
  bool updateShouldNotify(ScreenReturnScope oldWidget) =>
      !identical(observer, oldWidget.observer);
}

/// 이 화면 위에 쌓인 페이지가 닫혀 이 화면이 다시 최상위가 되면 [onReturn]을 부른다(REQ-ANL-004,
/// 백스택 변경마다 `screen_view`). 위에 쌓일 때는 [onCovered]를 부른다.
/// 여러 페이지를 한꺼번에 닫아(popUntil) 중간 화면이 잠깐 드러나는 경우는 최종 최상위만 보고한다.
class ScreenReturnReporter extends StatefulWidget {
  const ScreenReturnReporter({
    super.key,
    required this.onReturn,
    required this.child,
    this.onCovered,
  });

  final VoidCallback onReturn;
  final VoidCallback? onCovered;
  final Widget child;

  @override
  State<ScreenReturnReporter> createState() => _ScreenReturnReporterState();
}

class _ScreenReturnReporterState extends State<ScreenReturnReporter>
    with RouteAware {
  PageRoute<dynamic>? _route;
  ScreenReturnObserver? _observer;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    final page = route is PageRoute<dynamic> ? route : null;
    final observer = ScreenReturnScope.maybeOf(context);
    if (identical(page, _route) && identical(observer, _observer)) return;
    _observer?.unsubscribe(this);
    _route = page;
    _observer = observer;
    if (page != null) observer?.subscribe(this, page);
  }

  @override
  void didPushNext() => widget.onCovered?.call();

  @override
  void didPopNext() {
    final route = _route;
    scheduleMicrotask(() {
      if (!mounted || route == null || !route.isCurrent) return;
      widget.onReturn();
    });
  }

  @override
  void dispose() {
    _observer?.unsubscribe(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
