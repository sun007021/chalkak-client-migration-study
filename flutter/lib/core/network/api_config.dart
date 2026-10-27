/// `API_BASE_URL`(서버 origin) 검증 결과. https만 허용, 폴백 없음.
class ApiConfig {
  const ApiConfig.withRoot(this.apiRoot);

  /// 값이 없거나 https가 아니거나 호스트가 없으면 kind == config 인 ApiError를 던진다.
  /// `https://host`, `https://host/`, `https://host/api/v1[/]` 모두 같은 apiRoot가 된다.
  factory ApiConfig.parse(String? baseUrl) => throw UnimplementedError();

  /// 예: `https://host/api/v1` (끝에 슬래시 없음).
  final Uri apiRoot;
}
