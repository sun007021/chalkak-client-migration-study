import 'package:flutter/material.dart';

import '../core/ui/toast/toast_host.dart';
import '../features/feedback/presentation/feedback_screen.dart';
import '../features/feedback/presentation/feedback_view_model.dart';
import 'app_dependencies.dart';
import 'view_model_host.dart';

/// 푸시 탭 이동을 보류하는 이유 이름(`PushTapCoordinator.setBlocked`). 피드백 작성 중에만 막는다(TC-PUSH-060).
const Object _feedbackBlocker = 'feedback';

/// 피드백 화면 라우트. ViewModel의 생성과 정리는 [ViewModelHost]가 맡고, 작성 중에는 푸시 탭 이동을 보류한다.
/// 메인 셸 위에 쌓이므로 셸의 토스트가 가려진다. 같은 컨트롤러로 여기서도 그린다.
class FeedbackRoute extends StatelessWidget {
  const FeedbackRoute({super.key, required this.dependencies});

  final AppDependencies dependencies;

  @override
  Widget build(BuildContext context) => ViewModelHost<FeedbackViewModel>(
    create: () => FeedbackViewModel(
      repository: dependencies.settings.feedback,
      readUserId: () async => (await dependencies.sessions.read())?.userId,
      toast: dependencies.main.toast,
      analytics: dependencies.analytics,
      onComposingChanged: (composing) => dependencies.notification.coordinator
          .setBlocked(_feedbackBlocker, blocked: composing),
    ),
    builder: (context, viewModel) => ToastHost(
      controller: dependencies.main.toast,
      child: FeedbackScreen(
        viewModel: viewModel,
        onClose: () => Navigator.of(context).maybePop(),
      ),
    ),
  );
}
