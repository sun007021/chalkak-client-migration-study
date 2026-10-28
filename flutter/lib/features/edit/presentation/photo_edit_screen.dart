import 'package:flutter/widgets.dart';

import 'photo_edit_view_model.dart';

/// 사진 편집기 전체 화면(REQ-EDIT-001). 업로드 화면 위에 띄우는 내비게이션 목적지가 아닌 화면이다.
/// - 상단 "취소"/"완료", 사진 미리보기, 하단 탭 "자르기"/"조정"/"필터"(처음은 자르기, 선택 탭은 selected).
/// - 자르기 탭: 비율 버튼 9종(선택은 selected), "90도 회전", "초기화", 자르기 프레임.
/// - 조정 탭: 항목 줄(자동, 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함), 눈금자 슬라이더
///   (표시값 -100~100), 자동 보정 토글(checked)·강도, "초기화".
/// - 필터 탭: 필터 6종(선택은 selected).
/// - 렌더링 중 `photo-edit.rendering-indicator`, 렌더 실패 시 `photo-edit.error-dialog`에
///   `Copy.editErrorRender`. 상태 표시 요소는 해당 상태일 때만 트리에 존재한다.
/// ViewModel의 [PhotoEditViewModel.start]는 화면이 부른다.
class PhotoEditScreen extends StatefulWidget {
  const PhotoEditScreen({super.key, required this.viewModel});

  final PhotoEditViewModel viewModel;

  @override
  State<PhotoEditScreen> createState() => _PhotoEditScreenState();
}

class _PhotoEditScreenState extends State<PhotoEditScreen> {
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
