/// 자르기 영역(플랫폼 공통 편집값 모델, features/upload-edit.md 부록 "편집값 모델과 좌표").
/// - [centerX], [centerY]: 회전 전 원본의 가로·세로에 대한 0~1 비율(영역 중심).
/// - [width], [height]: 90도씩 돌린 원본의 가로·세로에 대한 0~1 비율.
/// 전체 자르기는 (0.5, 0.5, 1, 1).
class CropWindow {
  const CropWindow({
    required this.centerX,
    required this.centerY,
    required this.width,
    required this.height,
  });

  static const CropWindow full = CropWindow(
    centerX: 0.5,
    centerY: 0.5,
    width: 1,
    height: 1,
  );

  final double centerX;
  final double centerY;
  final double width;
  final double height;

  /// 전체와 [tolerance] 이내로 같은가(REQ-EDIT-004는 1e-3).
  bool isFull({double tolerance = 1e-3}) => throw UnimplementedError();

  @override
  bool operator ==(Object other) => throw UnimplementedError();

  @override
  int get hashCode => throw UnimplementedError();
}
