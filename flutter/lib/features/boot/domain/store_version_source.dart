/// 스토어가 알려 주는 최신 버전 문자열을 읽는다. 실패하면 던진다.
abstract interface class StoreVersionSource {
  /// 최신 버전 문자열. 결과가 없거나 version 필드가 없으면 null.
  Future<String?> fetchLatestVersion();
}
