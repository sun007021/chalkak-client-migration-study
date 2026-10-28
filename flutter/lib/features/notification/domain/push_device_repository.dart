/// 푸시 기기 등록 API. 실패는 `ApiError`로 던진다.
abstract interface class PushDeviceRepository {
  /// `PUT /push-devices/current` 바디 `{fcmToken}`뿐(기기 ID·플랫폼 없음, Bearer 필요). 204가 성공.
  /// 빈 토큰은 요청 없이 [ArgumentError](서버 400 방지, TC-PUSH-031).
  /// PUT은 멱등이라 연결 실패·5xx에 0.5초, 1초 간격으로 최대 2회 재시도한다(D-21, ApiClient).
  Future<void> register(String fcmToken);
}
