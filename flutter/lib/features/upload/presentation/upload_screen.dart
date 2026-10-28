import 'package:flutter/widgets.dart';

import '../../edit/presentation/photo_edit_view_model.dart';
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
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
