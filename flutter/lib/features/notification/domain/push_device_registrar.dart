import '../../../core/auth/session.dart';
import '../../../core/auth/session_manager.dart';
import '../../../core/network/api_error.dart';
import '../../../core/push/jwt_claims.dart';
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

  /// 마지막으로 [onTokenRefreshed]가 받은 토큰(로그인 전에 온 토큰도 기억한다).
  String? _lastToken;

  /// 이번 프로세스에서 등록에 성공한 (userId, token).
  ({String userId, String token})? _registered;

  /// [clearAll]마다 올라간다. 요청 도중 계정이 바뀌면 성공 기록을 남기지 않는다.
  int _generation = 0;

  /// 트리거를 한 줄로 세운다. 앞 작업의 성패와 무관하게 다음 작업이 이어진다.
  Future<void> _tail = Future<void>.value();

  @override
  Future<void> registerCurrentDevice() => _enqueue();

  /// SDK 토큰 발급·갱신. 마지막 값을 기억하고 로그인 상태면 그 값으로 등록한다(로그인 전이면 기억만 한다).
  Future<void> onTokenRefreshed(String token) {
    if (token.isNotEmpty) _lastToken = token;
    return _enqueue();
  }

  @override
  Future<void> clearAll() async {
    _generation++;
    _lastToken = null;
    _registered = null;
  }

  Future<void> _enqueue() {
    final result = _tail.then((_) => _registerOnce());
    _tail = result;
    return result;
  }

  /// 어떤 실패도 밖으로 내지 않는다. 푸시 등록은 로그인·가입·홈 진입을 막지 않는다(REQ-PUSH-014).
  Future<void> _registerOnce() async {
    final generation = _generation;
    try {
      var session = await _sessions.read();
      if (session == null || session.isGuest) return;

      final token = await _resolveToken();
      if (token == null || token.isEmpty) return;
      if (_isRegistered(session.userId, token)) return;

      if (!JwtClaims.hasSessionId(session.accessToken)) {
        // 서버가 기기를 로그인 세션에 묶으려면 session_id 클레임이 필요하다. 옛 토큰이면 먼저 갱신한다.
        session = await _refresher.refresh();
        if (session == null || session.isGuest) return;
        if (!JwtClaims.hasSessionId(session.accessToken)) return;
      }

      if (!await _putWithOneReauthRetry(session, token)) return;
      if (generation == _generation) {
        _registered = (userId: session.userId, token: token);
      }
    } on Object {
      // 연결 실패, 5xx, 400, 반복된 401, 갱신 실패: 모두 삼킨다.
      // 성공 기록을 남기지 않으므로 다음 트리거(포그라운드 복귀, 토큰 갱신)에 다시 시도한다.
    }
  }

  Future<String?> _resolveToken() async {
    final last = _lastToken;
    if (last != null && last.isNotEmpty) return last;
    return _tokens.currentToken();
  }

  bool _isRegistered(String userId, String token) {
    final done = _registered;
    return done != null && done.userId == userId && done.token == token;
  }

  /// 등록하고 성공 여부를 돌려준다. 401 `REAUTHENTICATION_REQUIRED`면 갱신을 한 번 시도하고
  /// 성공했을 때만 한 번 더 등록한다(무한 반복 없음).
  ///
  /// 실제 앱에서는 [ApiClient]가 등록 요청의 401 `REAUTHENTICATION_REQUIRED`를 받으면 이미 세션을 지운다
  /// (로그인 화면 이동은 세션 정리 이벤트가 한다). 그래서 갱신 전에 세션을 다시 읽어, 지워졌거나 다른 계정으로
  /// 바뀌었으면 갱신도 재등록도 하지 않고 끝낸다. 단위 테스트의 가짜 저장소처럼 세션이 남아 있을 때만 위 규칙대로
  /// 갱신과 1회 재등록을 한다.
  Future<bool> _putWithOneReauthRetry(Session session, String token) async {
    try {
      await _devices.register(token);
      return true;
    } on ApiError catch (error) {
      if (!error.isReauthenticationRequired) return false;
    }

    final current = await _sessions.read();
    if (current == null ||
        current.isGuest ||
        current.userId != session.userId) {
      return false;
    }
    final refreshed = await _refresher.refresh();
    if (refreshed == null ||
        refreshed.isGuest ||
        refreshed.userId != session.userId) {
      return false;
    }
    try {
      await _devices.register(token);
      return true;
    } on ApiError {
      return false;
    }
  }
}
