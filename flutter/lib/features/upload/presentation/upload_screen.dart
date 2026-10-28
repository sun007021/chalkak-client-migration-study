import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/text/code_points.dart';
import '../../../core/ui/test_id.dart';
import '../../edit/presentation/photo_edit_screen.dart';
import '../../edit/presentation/photo_edit_view_model.dart';
import '../../edit/presentation/rgba_image_view.dart';
import 'upload_test_ids.dart';
import 'upload_view_model.dart';

/// [OpenPhotoEditor] 요청으로 편집기 ViewModel을 만든다. 테스트는 Fake를 넣는다.
typedef PhotoEditViewModelFactory = PhotoEditViewModel Function(
  OpenPhotoEditor request,
);

/// 업로드 화면(REQ-UPL, testIDs `upload.*`).
/// - 상단 바: 닫기(`upload.close-button`), 제목 `Copy.uploadTitle`.
/// - 안내: `upload.topic-title`("주제 ‘{주제}’에 맞는 한 장"), `upload.guide-text`.
/// - 사진 영역: 사진이 없으면 앨범 버튼(`upload.album-button`)과 카메라 버튼
///   (`upload.camera-button`, 카메라가 없으면 트리에 없다), 있으면 원본 비율 미리보기
///   (`upload.photo-preview`, 탭하면 재편집).
/// - 제목 입력(`upload.title-input`, 여러 줄, 플레이스홀더 `Copy.uploadCaptionPlaceholder`,
///   `PostTitleInputFormatter`)과 글자 수(`upload.title-counter`).
/// - 주제 로드 오류와 "다시 시도", 준비 중 표시(`upload.preparing-indicator`), 오류 문구
///   (`upload.error-message`), 제출 버튼(`upload.submit-button`, 제출 중 "전시 중..."과 비활성,
///   제출 중 표시 `upload.submitting-indicator`).
/// - [OpenPhotoEditor]를 받으면 [editorFactory]로 만든 `PhotoEditScreen`을 위에 띄우고 결과를
///   [UploadViewModel.onEditCompleted] / [UploadViewModel.onEditCancelled]로 넘긴다.
/// 화면이 [UploadViewModel.start]를 부른다.
class UploadScreen extends StatefulWidget {
  const UploadScreen({
    super.key,
    required this.viewModel,
    required this.editorFactory,
    required this.onEvent,
  });

  final UploadViewModel viewModel;
  final PhotoEditViewModelFactory editorFactory;

  /// 편집기 요청을 뺀 이벤트([UploadSucceeded], [UploadLoginRequired])를 라우터에 알린다.
  final void Function(UploadEvent event) onEvent;

  @override
  State<UploadScreen> createState() => _UploadScreenState();
}

class _UploadScreenState extends State<UploadScreen> {
  late final StreamSubscription<UploadEvent> _sub;
  final TextEditingController _title = TextEditingController();
  bool _editorOpen = false;

  @override
  void initState() {
    super.initState();
    _sub = widget.viewModel.events.listen(_onEvent);
    unawaited(widget.viewModel.start());
  }

  @override
  void dispose() {
    _sub.cancel();
    // 화면이 내려가면 업로드 세션도 끝난다. 진행 중 요청을 취소하고 임시 파일을 지운다(멱등).
    widget.viewModel.dispose();
    _title.dispose();
    super.dispose();
  }

  void _onEvent(UploadEvent event) {
    if (!mounted) return;
    switch (event) {
      case OpenPhotoEditor():
        unawaited(_openEditor(event));
      case UploadSucceeded():
      case UploadLoginRequired():
        widget.onEvent(event);
    }
  }

  /// 편집기를 업로드 화면 위에 전체 화면으로 띄우고 결과를 ViewModel에 넘긴다.
  Future<void> _openEditor(OpenPhotoEditor request) async {
    if (_editorOpen) return;
    _editorOpen = true;
    final editor = widget.editorFactory(request);
    try {
      final result = await Navigator.of(context).push<PhotoEditEvent>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (context) => _EditorHost(viewModel: editor),
        ),
      );
      if (!mounted) return;
      switch (result) {
        case EditDone(:final edit, :final rendered):
          unawaited(widget.viewModel.onEditCompleted(edit, rendered));
        case EditCancelled():
        case null:
          widget.viewModel.onEditCancelled();
      }
    } finally {
      _editorOpen = false;
      editor.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    final vm = widget.viewModel;
    return TestId(
      UploadTestIds.root,
      child: Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          leading: TestId.button(
            UploadTestIds.closeButton,
            child: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => Navigator.of(context).maybePop(),
            ),
          ),
          title: const Text(Copy.uploadTitle),
          centerTitle: true,
        ),
        body: SafeArea(
          child: ListenableBuilder(
            listenable: vm,
            builder: (context, _) => _Body(viewModel: vm, title: _title),
          ),
        ),
      ),
    );
  }
}

/// 편집기 화면을 띄우고 완료·취소 이벤트를 라우트 결과로 돌려준다.
class _EditorHost extends StatefulWidget {
  const _EditorHost({required this.viewModel});

  final PhotoEditViewModel viewModel;

  @override
  State<_EditorHost> createState() => _EditorHostState();
}

class _EditorHostState extends State<_EditorHost> {
  late final StreamSubscription<PhotoEditEvent> _sub;
  bool _closed = false;

  @override
  void initState() {
    super.initState();
    _sub = widget.viewModel.events.listen((event) {
      if (_closed || !mounted) return;
      _closed = true;
      Navigator.of(context).pop(event);
    });
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      PhotoEditScreen(viewModel: widget.viewModel);
}

class _Body extends StatelessWidget {
  const _Body({required this.viewModel, required this.title});

  final UploadViewModel viewModel;
  final TextEditingController title;

  @override
  Widget build(BuildContext context) {
    final s = viewModel.state;
    final theme = Theme.of(context);
    final loaded = s.topicStatus == UploadTopicStatus.loaded;
    final message = s.topicError ?? s.error;
    return SingleChildScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (loaded) ...[
            TestId(
              UploadTestIds.topicTitle,
              child: Text(
                Copy.fill(Copy.uploadHeading, {'주제': s.topicTitle ?? ''}),
                style: theme.textTheme.titleLarge,
              ),
            ),
            const SizedBox(height: 4),
            TestId(
              UploadTestIds.guideText,
              child: Text(
                Copy.uploadSubheading,
                style: theme.textTheme.bodyMedium,
              ),
            ),
          ] else if (s.topicStatus == UploadTopicStatus.loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (s.topicStatus == UploadTopicStatus.failed &&
              s.topicError != null) ...[
            TestId(
              UploadTestIds.errorMessage,
              child: Text(
                s.topicError!,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: viewModel.onTopicRetry,
                child: const Text(Copy.uploadTopicRetry),
              ),
            ),
          ],
          const SizedBox(height: 16),
          _PhotoArea(viewModel: viewModel),
          const SizedBox(height: 16),
          _TitleField(viewModel: viewModel, controller: title),
          if (message != null && s.topicError == null) ...[
            const SizedBox(height: 12),
            TestId(
              UploadTestIds.errorMessage,
              child: Text(
                message,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          ],
          const SizedBox(height: 24),
          _SubmitButton(viewModel: viewModel),
        ],
      ),
    );
  }
}

class _PhotoArea extends StatelessWidget {
  const _PhotoArea({required this.viewModel});

  final UploadViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final s = viewModel.state;
    final preview = s.preview;
    if (s.photo == null || preview == null) {
      return Row(
        children: [
          Expanded(
            child: _PickButton(
              id: UploadTestIds.albumButton,
              icon: Icons.photo_library_outlined,
              onPressed: viewModel.onAlbumPressed,
            ),
          ),
          if (s.isCameraAvailable) ...[
            const SizedBox(width: 12),
            Expanded(
              child: _PickButton(
                id: UploadTestIds.cameraButton,
                icon: Icons.photo_camera_outlined,
                onPressed: viewModel.onCameraPressed,
              ),
            ),
          ],
        ],
      );
    }
    final ratio = preview.height > 0 ? preview.width / preview.height : 1.0;
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.5,
        ),
        child: TestId.button(
          UploadTestIds.photoPreview,
          child: GestureDetector(
            onTap: s.isSubmitting ? null : viewModel.onPhotoTapped,
            child: AspectRatio(
              aspectRatio: ratio,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: RgbaImageView(
                      image: preview,
                      fit: BoxFit.cover,
                      placeholder: const ColoredBox(color: Colors.black12),
                    ),
                  ),
                  if (s.preparation == PreparationStatus.preparing)
                    const Positioned(
                      right: 8,
                      bottom: 8,
                      child: TestId(
                        UploadTestIds.preparingIndicator,
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PickButton extends StatelessWidget {
  const _PickButton({
    required this.id,
    required this.icon,
    required this.onPressed,
  });

  final String id;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return TestId.button(
      id,
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(120),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        onPressed: onPressed,
        child: Icon(icon, size: 36),
      ),
    );
  }
}

class _TitleField extends StatelessWidget {
  const _TitleField({required this.viewModel, required this.controller});

  final UploadViewModel viewModel;
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final s = viewModel.state;
    // 상태가 입력창보다 앞서 정해졌을 때(거절된 입력 등) 입력창을 상태에 맞춘다.
    if (controller.text != s.title) {
      controller.value = TextEditingValue(
        text: s.title,
        selection: TextSelection.collapsed(offset: s.title.length),
      );
    }
    final count = strippedCodePointLength(s.title);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TestId(
          UploadTestIds.titleInput,
          child: TextField(
            controller: controller,
            enabled: !s.isSubmitting,
            minLines: 1,
            maxLines: 3,
            keyboardType: TextInputType.multiline,
            inputFormatters: [PostTitleInputFormatter()],
            onChanged: viewModel.onTitleChanged,
            decoration: const InputDecoration(
              hintText: Copy.uploadCaptionPlaceholder,
              border: OutlineInputBorder(),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerRight,
          child: TestId(
            UploadTestIds.titleCounter,
            child: Text(
              '$count/${AppConstants.postTitleMax}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ),
      ],
    );
  }
}

class _SubmitButton extends StatelessWidget {
  const _SubmitButton({required this.viewModel});

  final UploadViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final s = viewModel.state;
    return TestId.button(
      UploadTestIds.submitButton,
      child: FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        onPressed: s.canSubmit ? viewModel.onSubmitPressed : null,
        child: s.isSubmitting
            ? const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  TestId(
                    UploadTestIds.submittingIndicator,
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                  SizedBox(width: 8),
                  Text(Copy.uploadSubmitting),
                ],
              )
            : const Text(Copy.uploadSubmit),
      ),
    );
  }
}
