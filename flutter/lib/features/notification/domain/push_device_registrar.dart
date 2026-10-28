// 구현 전 껍데기: 본문이 비어 있어 필드가 아직 쓰이지 않는다. 구현하면서 이 줄을 지운다.
// ignore_for_file: unused_field

import '../../../core/auth/session_manager.dart';
import '../../../core/push/push_token_provider.dart';
import '../../auth/domain/push_registrar.dart';
import '../../auth/domain/user_data_cleaner.dart';
import 'push_device_repository.dart';
import 'session_refresher.dart';

/// 푸시 기기 등록(REQ-PUSH-007~016, 018). 기존 [PushRegistrar]의 실제 구현이다.
///
/// [registerCurrentDevice] 한 번의 흐름:
/// 1. 세션이 없거나 게스트면 아무것도 하지 않는다(요청 0건).
/// 2. 토큰은 [onTokenRefreshed]로 받은 마지막 값, 없으면 [PushTokenProvider.currentToken]. 둘 다 없거나 빈 문자열이면
///    건너뛴다(요청 0건). 토큰이 준비되면([onTokenRefreshed]) 로그인된 상태에서 바로 등록한다.
/// 3. 같은 프로세스에서 이미 성공한 (userId, token)이면 보내지 않는다. 동시에 들어온 트리거는 한 줄로 직렬화되어
///    요청은 1회뿐이다.
/// 4. 액세스 토큰에 `session_id` 클레임이 없으면 먼저 [SessionRefresher.refresh]로 갱신해 새 토큰으로 등록한다.
///    갱신한 토큰에도 없으면 요청 없이 끝낸다(로그인 유지). 갱신이 던져도(REAUTH 포함) 예외를 밖으로 내지 않는다.
/// 5. 등록이 401 `REAUTHENTICATION_REQUIRED`면 갱신을 한 번 시도하고 성공하면 한 번만 다시 등록한다.
///    그 밖의 실패(400, 401 반복, 연결 실패, 5xx)는 삼킨다: 로그인 유지, 토스트·분석 없음, 중복 제거 기록 없음
///    (다음 트리거에 다시 시도).
/// 6. 성공하면 (userId, token)을 기록한다. [clearAll](로그아웃·계정 전환)은 이 기록과 토큰 캐시를 비운다.
///    기기 해제 API는 없다(D-16).
class PushDeviceRegistrar implements PushRegistrar, UserDataCleaner {
  PushDeviceRegistrar({
    required this._tokens,
    required this._devices,
    required this._sessions,
    required this._refresher,
  });

  final PushTokenProvider _tokens;
  final PushDeviceRepository _devices;
  final SessionManager _sessions;
  final SessionRefresher _refresher;

  @override
  Future<void> registerCurrentDevice() => throw UnimplementedError();

  /// SDK 토큰 발급·갱신. 마지막 값을 기억하고 로그인 상태면 그 값으로 등록한다(로그인 전이면 기억만 한다).
  Future<void> onTokenRefreshed(String token) => throw UnimplementedError();

  @override
  Future<void> clearAll() => throw UnimplementedError();
}
