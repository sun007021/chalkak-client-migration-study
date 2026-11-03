import 'dart:async';

import 'package:flutter/widgets.dart';

/// 앱 라우터(Navigator)에 한 번 붙이는 관찰자. 페이지 라우트가 닫혀 아래 라우트가 다시 보일 때
/// [ScreenReturnReporter]에 알린다. 다이얼로그·시트(PopupRoute)는 화면 전환이 아니라 제외한다.
final RouteObserver<PageRoute<dynamic>> screenReturnObserver =
    RouteObserver<PageRoute<dynamic>>();

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

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    final page = route is PageRoute<dynamic> ? route : null;
    if (identical(page, _route)) return;
    screenReturnObserver.unsubscribe(this);
    _route = page;
    if (page != null) screenReturnObserver.subscribe(this, page);
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
    screenReturnObserver.unsubscribe(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
