import '../../../core/auth/session.dart';
import '../../../core/network/api_client.dart';
import '../domain/session_refresher.dart';

/// [SessionRefresher]의 ApiClient 구현. 갱신은 ApiClient의 single-flight를 그대로 쓴다
/// (푸시 등록이 갱신하는 동안 다른 요청의 401 갱신과 같은 refresh token을 두 번 보내지 않는다).
class ApiSessionRefresher implements SessionRefresher {
  ApiSessionRefresher({required this._client});

  final ApiClient _client;

  @override
  Future<Session?> refresh() => _client.refreshSession();
}
