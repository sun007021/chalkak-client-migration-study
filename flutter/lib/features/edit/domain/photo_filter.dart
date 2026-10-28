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
  String get label => throw UnimplementedError();

  /// 4x5 컬러 행렬 20개 값(행: 결과 R, G, B, A / 열: 입력 R, G, B, A, 더하는 값).
  /// 색 값은 0~255 단위, [original]은 적용하지 않으므로 null.
  /// 값은 `shared/photo-edit/filters.json`과 같아야 한다(REQ-EDIT-029).
  List<double>? get matrix => throw UnimplementedError();
}
