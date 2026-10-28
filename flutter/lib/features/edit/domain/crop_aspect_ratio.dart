import '../../../core/copy/ko.g.dart';

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
  String get label => switch (this) {
    original => Copy.editRatioOriginal,
    free => Copy.editRatioFree,
    r1x1 => Copy.editRatio11,
    r4x5 => Copy.editRatio45,
    r5x4 => Copy.editRatio54,
    r3x4 => Copy.editRatio34,
    r4x3 => Copy.editRatio43,
    r9x16 => Copy.editRatio916,
    r16x9 => Copy.editRatio169,
  };

  /// 가로 / 세로. [original]과 [free]는 null(원본은 지금 회전 방향의 사진 비율을 쓴다).
  double? get fixedRatio => switch (this) {
    original || free => null,
    r1x1 => 1,
    r4x5 => 4 / 5,
    r5x4 => 5 / 4,
    r3x4 => 3 / 4,
    r4x3 => 4 / 3,
    r9x16 => 9 / 16,
    r16x9 => 16 / 9,
  };

  /// 가로세로를 뒤바꾼 짝(4:5 <-> 5:4, 3:4 <-> 4:3, 9:16 <-> 16:9, 1:1은 자기 자신).
  /// [original]과 [free]는 자기 자신.
  CropAspectRatio get rotated => switch (this) {
    r4x5 => r5x4,
    r5x4 => r4x5,
    r3x4 => r4x3,
    r4x3 => r3x4,
    r9x16 => r16x9,
    r16x9 => r9x16,
    _ => this,
  };
}
