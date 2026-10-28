import 'package:flutter/material.dart';

import '../core/ui/toast/toast_host.dart';
import '../features/feedback/presentation/feedback_screen.dart';
import '../features/feedback/presentation/feedback_view_model.dart';
import 'app_dependencies.dart';

/// 푸시 탭 이동을 보류하는 이유 이름(`PushTapCoordinator.setBlocked`). 피드백 작성 중에만 막는다(TC-PUSH-060).
const Object feedbackBlocker = 'feedback';

/// 피드백 화면 라우트. ViewModel의 생성과 정리를 맡고, 작성 중에는 푸시 탭 이동을 보류한다.
/// 메인 셸 위에 쌓이므로 셸의 토스트가 가려진다. 같은 컨트롤러로 여기서도 그린다.
class FeedbackRoute extends StatefulWidget {
  const FeedbackRoute({super.key, required this.dependencies});

  final AppDependencies dependencies;

  @override
  State<FeedbackRoute> createState() => _FeedbackRouteState();
}

class _FeedbackRouteState extends State<FeedbackRoute> {
  late final FeedbackViewModel _viewModel = FeedbackViewModel(
    repository: widget.dependencies.settings.feedback,
    sessions: widget.dependencies.sessions,
    toast: widget.dependencies.main.toast,
    analytics: widget.dependencies.analytics,
    onComposingChanged: (composing) => widget
        .dependencies
        .notification
        .coordinator
        .setBlocked(feedbackBlocker, blocked: composing),
  );

  @override
  void dispose() {
    _viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ToastHost(
    controller: widget.dependencies.main.toast,
    child: FeedbackScreen(
      viewModel: _viewModel,
      onClose: () => Navigator.of(context).maybePop(),
    ),
  );
}
