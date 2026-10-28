// 구현 전 껍데기: 본문이 비어 있어 필드가 아직 쓰이지 않는다. 구현하면서 이 줄을 지운다.
// ignore_for_file: unused_field

import '../../../core/network/api_client.dart';
import '../domain/push_device_repository.dart';

/// [PushDeviceRepository]의 ApiClient 구현. 토큰 원문은 로그에 남기지 않는다(REQ-PUSH-018).
class ApiPushDeviceRepository implements PushDeviceRepository {
  ApiPushDeviceRepository({required this._client});

  final ApiClient _client;

  @override
  Future<void> register(String fcmToken) => throw UnimplementedError();
}
