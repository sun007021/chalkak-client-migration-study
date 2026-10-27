import '../auth/session.dart';
import 'api_request.dart';
import 'network_config.dart';
import 'url_rule.dart';

class AuthorizationPolicy {
  const AuthorizationPolicy._();

  static const String _prefix = '${NetworkConfig.apiPrefix}/';

  /// 토큰을 붙이지 않는 API인지. `/auth/**`(refresh·logout·소셜 포함)와 GET /banners.
  /// [apiPath]는 `/api/v1` 뒤 경로.
  static bool isExcluded(HttpMethod method, String apiPath) =>
      apiPath.startsWith('/auth/') ||
      (method == HttpMethod.get && apiPath == '/banners');

  /// Authorization을 붙일지. 허용된 스킴(https, loopback의 http)이고 `/api/v1/` 아래이며,
  /// 제외 대상(POST /auth/refresh, POST /auth/logout, GET /banners 등)이 아니고,
  /// 게스트가 아니며 access token이 만료되지 않았을 때만 true.
  static bool attaches({
    required Uri url,
    required HttpMethod method,
    required Session? session,
    required DateTime now,
  }) {
    if (session == null || session.isGuest) return false;
    if (!UrlRule.isAllowed(url) || !url.path.startsWith(_prefix)) return false;
    if (isExcluded(
      method,
      url.path.substring(NetworkConfig.apiPrefix.length),
    )) {
      return false;
    }
    return !session.isAccessExpired(now);
  }
}
