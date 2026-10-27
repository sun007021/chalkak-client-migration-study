/// 서버·저장소 URL에 허용하는 스킴 규칙. https만 허용하고, 로컬 mock 서버를 위해
/// loopback 호스트의 http만 예외로 둔다. API 기준 주소와 presigned URL이 같은 규칙을 쓴다.
class UrlRule {
  const UrlRule._();

  /// 개발 기기·에뮬레이터에서 호스트 PC를 가리키는 주소(10.0.2.2는 Android 에뮬레이터).
  static const Set<String> loopbackHosts = {
    'localhost',
    '127.0.0.1',
    '10.0.2.2',
  };

  static bool isLoopbackHost(String host) =>
      loopbackHosts.contains(host.toLowerCase());

  /// 호스트가 있고 (https이거나 loopback의 http)이면 true.
  static bool isAllowed(Uri url) {
    if (url.host.isEmpty) return false;
    if (url.scheme == 'https') return true;
    return url.scheme == 'http' && isLoopbackHost(url.host);
  }
}
