import '../../../core/copy/ko.g.dart';

/// 필터 6종(REQ-EDIT-028). 선언 순서가 화면 순서이고 처음은 [original].
/// iOS의 선명·크롬·페이드·누아르 목록은 쓰지 않는다(D-13).
enum PhotoFilter {
  original,
  mono,
  warm,
  cool,
  vintage,
  vivid;

  /// `Copy.editFilter*` 문구.
  String get label => switch (this) {
    original => Copy.editFilterOriginal,
    mono => Copy.editFilterMono,
    warm => Copy.editFilterWarm,
    cool => Copy.editFilterCool,
    vintage => Copy.editFilterVintage,
    vivid => Copy.editFilterVivid,
  };

  /// 4x5 컬러 행렬 20개 값(행: 결과 R, G, B, A / 열: 입력 R, G, B, A, 더하는 값).
  /// 색 값은 0~255 단위, [original]은 적용하지 않으므로 null.
  /// 값은 `shared/photo-edit/filters.json`과 같아야 한다(REQ-EDIT-029).
  List<double>? get matrix => switch (this) {
    original => null,
    mono => const [
      0.299, 0.587, 0.114, 0, 0, //
      0.299, 0.587, 0.114, 0, 0,
      0.299, 0.587, 0.114, 0, 0,
      0, 0, 0, 1, 0,
    ],
    warm => const [
      1.08, 0, 0, 0, 8, //
      0, 1.02, 0, 0, 4,
      0, 0, 0.88, 0, 0,
      0, 0, 0, 1, 0,
    ],
    cool => const [
      0.9, 0, 0, 0, 0, //
      0, 1, 0, 0, 2,
      0, 0, 1.1, 0, 10,
      0, 0, 0, 1, 0,
    ],
    vintage => const [
      0.63, 0.35, 0.09, 0, 18, //
      0.16, 0.76, 0.08, 0, 14,
      0.12, 0.24, 0.51, 0, 10,
      0, 0, 0, 1, 0,
    ],
    vivid => const [
      1.2754, -0.2503, -0.0252, 0, 0, //
      -0.0746, 1.0997, -0.0252, 0, 0,
      -0.0746, -0.2503, 1.3248, 0, 0,
      0, 0, 0, 1, 0,
    ],
  };
}
