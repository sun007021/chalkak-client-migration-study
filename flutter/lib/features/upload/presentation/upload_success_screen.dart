import 'package:flutter/widgets.dart';

import 'upload_success_view_model.dart';

/// 업로드 성공 화면(REQ-UPL-060~062, testIDs `upload-success.*`):
/// 전시한 사진 카드, 기록 문구(`upload-success.message`), 상태 안내(`upload-success.status-message`),
/// 버튼 "확인했어요."(`upload-success.confirm-button`).
class UploadSuccessScreen extends StatefulWidget {
  const UploadSuccessScreen({
    super.key,
    required this.viewModel,
    required this.onEvent,
  });

  final UploadSuccessViewModel viewModel;
  final void Function(UploadSuccessEvent event) onEvent;

  @override
  State<UploadSuccessScreen> createState() => _UploadSuccessScreenState();
}

class _UploadSuccessScreenState extends State<UploadSuccessScreen> {
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
