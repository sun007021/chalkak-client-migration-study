/// 자르기 비율 9종(REQ-EDIT-010). 선언 순서가 화면 순서다:
/// 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9. 처음 선택은 [free].
enum CropAspectRatio {
  original,
  free,
  r1x1,
  r4x5,
  r5x4,
  r3x4,
  r4x3,
  r9x16,
  r16x9;

  /// `Copy.editRatio*` 문구.
  String get label => throw UnimplementedError();

  /// 가로 / 세로. [original]과 [free]는 null(원본은 지금 회전 방향의 사진 비율을 쓴다).
  double? get fixedRatio => throw UnimplementedError();

  /// 가로세로를 뒤바꾼 짝(4:5 <-> 5:4, 3:4 <-> 4:3, 9:16 <-> 16:9, 1:1은 자기 자신).
  /// [original]과 [free]는 자기 자신.
  CropAspectRatio get rotated => throw UnimplementedError();
}
