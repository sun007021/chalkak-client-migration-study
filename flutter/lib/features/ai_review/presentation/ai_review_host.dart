import 'package:flutter/material.dart';

import '../domain/ai_review_session.dart';
import '../domain/ai_review_state.dart';
import 'ai_review_sheets.dart';

/// 알약·홈 카드가 함께 쓰는 연결 위젯(REQ-AIR-050).
///
/// - 붙어 있고 [visible]이며 앱이 앞에 있는 동안만 [AiReviewSession.onShown], 그 밖에는
///   [AiReviewSession.onHidden]을 부른다. 세션 호출은 빌드 중이 아니라 프레임이 끝난 뒤에 한다.
/// - 세션의 시트·기준 다이얼로그 상태를 실제 하단 시트·다이얼로그로 연다. 사용자가 직접 닫으면
///   세션에 알린다.
class AiReviewHost extends StatefulWidget {
  const AiReviewHost({
    super.key,
    required this.session,
    required this.visible,
    required this.builder,
  });

  final AiReviewSession session;
  final bool visible;
  final Widget Function(BuildContext context, AiReviewState state) builder;

  @override
  State<AiReviewHost> createState() => _AiReviewHostState();
}

class _AiReviewHostState extends State<AiReviewHost>
    with WidgetsBindingObserver {
  bool _shown = false;
  bool _foreground = true;

  Object? _sheetToken;
  BuildContext? _sheetContext;
  Object? _dialogToken;
  BuildContext? _dialogContext;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = !_isBackground(lifecycle);
    widget.session.addListener(_onSession);
    _syncAfterFrame();
  }

  @override
  void didUpdateWidget(AiReviewHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.session != widget.session) {
      oldWidget.session.removeListener(_onSession);
      if (_shown) oldWidget.session.onHidden();
      _shown = false;
      widget.session.addListener(_onSession);
    }
    _syncAfterFrame();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.session.removeListener(_onSession);
    if (_shown) widget.session.onHidden();
    _closeLeftovers();
    super.dispose();
  }

  static bool _isBackground(AppLifecycleState? state) =>
      state == AppLifecycleState.paused ||
      state == AppLifecycleState.hidden ||
      state == AppLifecycleState.detached;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive) return;
    _foreground = !_isBackground(state);
    _sync();
  }

  void _syncAfterFrame() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _sync();
    });
  }

  void _sync() {
    final want = widget.visible && _foreground;
    if (want && !_shown) {
      _shown = true;
      widget.session.onShown();
    } else if (!want && _shown) {
      _shown = false;
      widget.session.onHidden();
    }
  }

  // ---- 시트·다이얼로그 ----

  void _onSession() {
    if (!mounted) return;
    final state = widget.session.state;
    if (state.sheet != null && _sheetToken == null) {
      _openSheet();
    }
    if (state.sheet != null &&
        state.criteriaDialogOpen &&
        _dialogToken == null) {
      _openDialog();
    }
    if (!state.criteriaDialogOpen && _dialogToken != null) {
      _closeDialog();
    }
    if (state.sheet == null && _sheetToken != null) {
      _closeDialog();
      _closeSheet();
    }
  }

  void _openSheet() {
    final token = _sheetToken = Object();
    final session = widget.session;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        _sheetContext = sheetContext;
        return AiReviewSheetContent(session: session);
      },
    ).whenComplete(() {
      if (_sheetToken != token) return;
      _sheetToken = null;
      _sheetContext = null;
      if (session.state.sheet != null) session.onSheetDismissed();
    });
  }

  void _openDialog() {
    final token = _dialogToken = Object();
    final session = widget.session;
    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        _dialogContext = dialogContext;
        return const AiReviewCriteriaDialog();
      },
    ).whenComplete(() {
      if (_dialogToken != token) return;
      _dialogToken = null;
      _dialogContext = null;
      if (session.state.criteriaDialogOpen) session.onCriteriaHelpDismissed();
    });
  }

  void _closeSheet() {
    final route = _routeOf(_sheetContext);
    _sheetToken = null;
    _sheetContext = null;
    _removeRoute(route);
  }

  void _closeDialog() {
    final route = _routeOf(_dialogContext);
    _dialogToken = null;
    _dialogContext = null;
    _removeRoute(route);
  }

  static ModalRoute<Object?>? _routeOf(BuildContext? context) {
    if (context == null || !context.mounted) return null;
    final route = ModalRoute.of(context);
    return route != null && route.isActive ? route : null;
  }

  static void _removeRoute(ModalRoute<Object?>? route) {
    final navigator = route?.navigator;
    if (route == null || navigator == null) return;
    if (route.isCurrent) {
      navigator.pop();
    } else {
      navigator.removeRoute(route);
    }
  }

  /// 위젯이 사라질 때 열려 있는 시트·다이얼로그를 프레임 뒤에 닫는다(세션은 호출자가 정리한다).
  void _closeLeftovers() {
    final routes = [_routeOf(_dialogContext), _routeOf(_sheetContext)];
    _sheetToken = null;
    _dialogToken = null;
    _sheetContext = null;
    _dialogContext = null;
    if (routes.every((r) => r == null)) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      for (final route in routes) {
        if (route != null && route.isActive) _removeRoute(route);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.session,
      builder: (context, _) => widget.builder(context, widget.session.state),
    );
  }
}
