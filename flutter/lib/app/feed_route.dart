import 'dart:async';

import 'package:flutter/material.dart';

import '../core/ui/toast/toast_host.dart';
import '../features/feed/domain/feed_target.dart';
import '../features/feed/presentation/feed_screen.dart';
import '../features/feed/presentation/feed_view_model.dart';
import 'app_dependencies.dart';

/// AI 피드백 시트를 여는 훅. 푸시·알림함에서 AI 알림으로 들어오면(`openAiFeedback`) 상세 로드가 끝난 뒤 한 번 불린다.
/// AI 피드백 기능이 시트를 제공하면 그 구현을 연결한다. 기본값은 아무것도 하지 않는다.
typedef AiFeedbackOpener = void Function(BuildContext context, String postId);

void _noAiFeedbackOpener(BuildContext context, String postId) {}

/// 게시물 상세 라우트: [FeedViewModel]을 만들고 `load()`를 부른 뒤 [FeedScreen]을 그린다.
/// - [FeedToast]는 메인의 토스트 컨트롤러로, [FeedClose]와 뒤로 가기는 라우트를 닫는다.
/// - 메인 셸 위에 쌓이는 라우트라 셸의 토스트가 가려지므로 같은 컨트롤러로 여기서도 그린다.
///   좋아요 토스트는 메인이 `LikeStore.toasts`를 한 번만 구독해 같은 컨트롤러로 보낸다.
/// - 앱이 다시 포그라운드가 되면 `onResumed`(KST 날짜 재계산).
class FeedRoute extends StatefulWidget {
  const FeedRoute({
    super.key,
    required this.dependencies,
    required this.target,
    required this.userId,
    this.openAiFeedback = false,
    this.aiFeedbackOpener = _noAiFeedbackOpener,
  });

  final AppDependencies dependencies;
  final FeedTarget target;

  /// 게스트·세션 없음이면 null(내 게시물 판정이 항상 false).
  final String? userId;

  /// AI 피드백 알림으로 들어왔다. 상세가 로드된 뒤 [aiFeedbackOpener]를 한 번 부른다.
  final bool openAiFeedback;
  final AiFeedbackOpener aiFeedbackOpener;

  @override
  State<FeedRoute> createState() => _FeedRouteState();
}

class _FeedRouteState extends State<FeedRoute> with WidgetsBindingObserver {
  late final FeedViewModel _viewModel = FeedViewModel(
    target: widget.target,
    repository: widget.dependencies.main.postRepository,
    likes: widget.dependencies.main.likeStore,
    postEvents: widget.dependencies.main.postEvents,
    userId: widget.userId,
  );
  StreamSubscription<FeedEvent>? _events;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  Future<void> _load() async {
    await _viewModel.load();
    // 상세를 못 불러왔으면(404, 오류) 시트를 열지 않는다.
    if (widget.openAiFeedback &&
        mounted &&
        _viewModel.state.status == FeedStatus.content) {
      widget.aiFeedbackOpener(context, widget.target.postId);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_events?.cancel());
    _viewModel.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _viewModel.onResumed();
  }

  void _close() => unawaited(Navigator.of(context).maybePop());

  @override
  Widget build(BuildContext context) {
    final toast = widget.dependencies.main.toast;
    return ToastHost(
      controller: toast,
      child: FeedScreen(
        viewModel: _viewModel,
        onToast: (message) => toast.show(message.text),
        onClose: _close,
      ),
    );
  }
}
