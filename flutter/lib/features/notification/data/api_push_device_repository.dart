import '../../../core/network/api_client.dart';
import '../../../core/network/api_request.dart';
import '../domain/push_device_repository.dart';

/// [PushDeviceRepository]의 ApiClient 구현. 토큰 원문은 로그에 남기지 않는다(REQ-PUSH-018).
class ApiPushDeviceRepository implements PushDeviceRepository {
  ApiPushDeviceRepository({required this._client});

  final ApiClient _client;

  @override
  Future<void> register(String fcmToken) {
    if (fcmToken.isEmpty) {
      // 빈 토큰은 서버가 400으로 거절하므로 보내지 않는다(TC-PUSH-031).
      return Future<void>.error(
        ArgumentError.value(fcmToken, 'fcmToken', '빈 토큰은 등록할 수 없다'),
      );
    }
    return _client.requestNoContent(
      ApiRequest(
        HttpMethod.put,
        '/push-devices/current',
        body: {'fcmToken': fcmToken},
      ),
    );
  }
}
