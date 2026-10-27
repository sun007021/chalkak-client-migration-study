import '../auth/session.dart';
import 'api_request.dart';

class AuthorizationPolicy {
  const AuthorizationPolicy._();

  /// Authorization을 붙일지. https이고 `/api/v1/` 아래이며, 제외 대상
  /// (POST /auth/refresh, POST /auth/logout, GET /banners)이 아니고,
  /// 게스트가 아니며 access token이 만료되지 않았을 때만 true.
  static bool attaches({
    required Uri url,
    required HttpMethod method,
    required Session? session,
    required DateTime now,
  }) => throw UnimplementedError();
}
