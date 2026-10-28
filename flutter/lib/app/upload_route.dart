import 'package:flutter/material.dart';

import '../core/time/kst_date.dart';
import '../core/ui/toast/toast_host.dart';
import '../features/edit/domain/rgba_image.dart';
import '../features/edit/presentation/photo_edit_view_model.dart';
import '../features/upload/presentation/upload_screen.dart';
import '../features/upload/presentation/upload_success_screen.dart';
import '../features/upload/presentation/upload_success_view_model.dart';
import '../features/upload/presentation/upload_view_model.dart';
import 'app_dependencies.dart';

/// 업로드 흐름이 끝난 방식. 라우트가 닫힌 뒤 메인이 이어서 처리한다.
sealed class UploadExit {
  const UploadExit();
}

/// 성공 화면에서 "확인했어요." -> 전시 탭의 [date]로(업로드 화면으로는 돌아오지 않는다).
final class UploadExitToDisplay extends UploadExit {
  const UploadExitToDisplay(this.date);

  final KstDate date;
}

/// 401 재인증 -> 로그인 화면으로.
final class UploadExitToLogin extends UploadExit {
  const UploadExitToLogin();
}

/// 업로드 화면. 성공하면 성공 화면으로 바꿔 끼워(뒤로 가도 업로드 화면이 없다) [onExit]에 끝난 방식을 넘긴다.
/// 라우트를 연 쪽이 라우트가 닫힌 뒤 [onExit]로 받은 값을 처리한다.
class UploadRoute extends StatefulWidget {
  const UploadRoute({
    super.key,
    required this.dependencies,
    required this.topicDate,
    required this.onExit,
  });

  final AppDependencies dependencies;
  final KstDate topicDate;
  final void Function(UploadExit exit) onExit;

  @override
  State<UploadRoute> createState() => _UploadRouteState();
}

class _UploadRouteState extends State<UploadRoute> {
  late final _upload = widget.dependencies.main.upload;
  late final UploadViewModel _viewModel = UploadViewModel(
    topicDate: widget.topicDate,
    topics: _upload.topics,
    picker: _upload.picker,
    gallery: _upload.gallery,
    decoder: _upload.decoder,
    preparer: _upload.preparer,
    submitter: _upload.submitter,
    toast: _upload.toast,
    analytics: widget.dependencies.analytics,
  );

  @override
  void dispose() {
    _viewModel.dispose();
    super.dispose();
  }

  PhotoEditViewModel _editor(OpenPhotoEditor request) => PhotoEditViewModel(
    sourceBytes: request.sourceBytes,
    initial: request.initialEdit,
    loader: _upload.editSourceLoader,
    renderer: _upload.editRenderer,
    analyzer: _upload.autoAnalyzer,
  );

  void _onEvent(UploadEvent event) {
    switch (event) {
      case UploadSucceeded():
        final success = UploadSuccessViewModel(
          topicTitle: event.topicTitle,
          topicDate: event.topicDate,
          moderationStatus: event.moderationStatus,
          analytics: widget.dependencies.analytics,
        );
        Navigator.of(context).pushReplacement<void, void>(
          MaterialPageRoute<void>(
            builder: (_) => _SuccessHost(
              viewModel: success,
              photo: event.preview,
              onExit: widget.onExit,
            ),
          ),
        );
      case UploadLoginRequired():
        widget.onExit(const UploadExitToLogin());
        Navigator.of(context).maybePop();
      case OpenPhotoEditor():
        break;
    }
  }

  @override
  // 업로드 화면은 메인 셸 위에 쌓여 셸의 토스트가 가려지므로 같은 컨트롤러로 여기서도 그린다.
  Widget build(BuildContext context) => ToastHost(
    controller: widget.dependencies.main.toast,
    child: UploadScreen(
      viewModel: _viewModel,
      editorFactory: _editor,
      onEvent: _onEvent,
    ),
  );
}

class _SuccessHost extends StatefulWidget {
  const _SuccessHost({
    required this.viewModel,
    required this.photo,
    required this.onExit,
  });

  final UploadSuccessViewModel viewModel;
  final RgbaImage? photo;
  final void Function(UploadExit exit) onExit;

  @override
  State<_SuccessHost> createState() => _SuccessHostState();
}

class _SuccessHostState extends State<_SuccessHost> {
  @override
  void dispose() {
    widget.viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    // 성공 뒤에는 시스템 뒤로 가기도 "확인했어요."와 같은 곳(전시 탭)으로 보낸다.
    canPop: false,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) widget.viewModel.onConfirmPressed();
    },
    child: UploadSuccessScreen(
      viewModel: widget.viewModel,
      photo: widget.photo,
      onEvent: (event) {
        switch (event) {
          case OpenDisplayOn(:final date):
            widget.onExit(UploadExitToDisplay(date));
            Navigator.of(context).pop();
        }
      },
    ),
  );
}
