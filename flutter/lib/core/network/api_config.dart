import 'api_error.dart';
import 'network_config.dart';
import 'url_rule.dart';

/// `API_BASE_URL`(서버 origin) 검증 결과. https만 허용(loopback 호스트의 http는 예외),
/// 폴백 없음.
class ApiConfig {
  const ApiConfig.withRoot(this.apiRoot);

  /// 값이 없거나 허용되지 않는 스킴이거나 호스트가 없으면 kind == config 인 ApiError를 던진다.
  /// `https://host`, `https://host/`, `https://host/api/v1[/]` 모두 같은 apiRoot가 된다.
  /// http는 localhost, 127.0.0.1, 10.0.2.2에서만 허용한다(mock 서버용).
  factory ApiConfig.parse(String? baseUrl) {
    final raw = baseUrl?.trim() ?? '';
    if (raw.isEmpty) throw ApiError.config('API_BASE_URL이 비어 있다');
    final uri = Uri.tryParse(raw);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw ApiError.config('API_BASE_URL을 해석할 수 없다');
    }
    if (!UrlRule.isAllowed(uri)) {
      throw ApiError.config('API_BASE_URL은 https여야 한다(loopback만 http 허용)');
    }
    if (uri.hasQuery || uri.hasFragment || uri.userInfo.isNotEmpty) {
      throw ApiError.config('API_BASE_URL에 쿼리·프래그먼트·사용자 정보를 넣을 수 없다');
    }
    final path = uri.path.replaceAll(RegExp(r'/+$'), '');
    if (path.isNotEmpty && path != NetworkConfig.apiPrefix) {
      throw ApiError.config('API_BASE_URL은 서버 origin이어야 한다');
    }
    return ApiConfig.withRoot(
      Uri(
        scheme: uri.scheme,
        host: uri.host,
        port: uri.hasPort ? uri.port : null,
        path: NetworkConfig.apiPrefix,
      ),
    );
  }

  /// 예: `https://host/api/v1` (끝에 슬래시 없음).
  final Uri apiRoot;
}
