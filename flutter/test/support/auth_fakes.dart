import 'dart:async';
import 'dart:convert';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/auth/token_store.dart';
import 'package:chalkak/core/network/api_client.dart';
import 'package:chalkak/core/network/api_config.dart';
import 'package:chalkak/features/auth/domain/auth_repository.dart';
import 'package:chalkak/features/auth/domain/kakao_sdk_gateway.dart';
import 'package:chalkak/features/auth/domain/nonce.dart';
import 'package:chalkak/features/auth/domain/push_registrar.dart';
import 'package:chalkak/features/auth/domain/social_login_client.dart';
import 'package:chalkak/features/auth/domain/user_data_cleaner.dart';
import 'package:chalkak/features/boot/data/play_update_checker.dart';
import 'package:chalkak/features/boot/domain/home_preloader.dart';
import 'package:chalkak/features/boot/domain/store_version_source.dart';
import 'package:chalkak/features/boot/domain/update_checker.dart';
import 'package:dio/dio.dart';

import 'fake_adapter.dart';
import 'fakes.dart';
import 'fixtures.dart';
import 'net_harness.dart' show apiHost, v1;

/// 공용 fixture(`auth/…`, `common/…`)를 manifest의 상태 코드와 함께 응답으로 만든다.
FakeResponse fixtureResponse(String name) {
  final r = Fixture.response(name);
  if (r.isFault) {
    return FakeResponse.fault(
      r.fault == 'timeout' ? FakeFault.timeout : FakeFault.disconnect,
    );
  }
  return FakeResponse.fromFixture(
    r.route.status!,
    r.json.cast<String, Object?>(),
  );
}

/// `boot/session__*.json`(storage fixture)을 보안 저장소에 시드한다.
/// - `{}`: 아무것도 쓰지 않음
/// - `guest`만 있음: 게스트 세션
/// - 일부 필드만 있음: 필수 필드가 빠진 JSON(읽기 실패)
/// - `corrupted: true`: JSON이 아닌 깨진 값
/// 저장소 키는 구현 세부이므로 먼저 유효한 세션을 써서 키를 알아낸 뒤 값을 바꾼다.
Future<SecureTokenStore> seededStore(
  FakeSecureKeyValueStore kv,
  String fixtureName,
) async {
  final fx = (Fixture.load(fixtureName) as Map).cast<String, Object?>();
  final stored = ((fx['stored'] ?? const {}) as Map).cast<String, Object?>();
  final store = SecureTokenStore(storage: kv);
  if (stored.isEmpty) return store;
  await store.write(Session.guest());
  final key = kv.data.keys.single;
  if (fx['corrupted'] == true) {
    kv.data[key] = '!!undecryptable-ciphertext!!';
  } else if (stored.keys.length == 1 && stored['guest'] == true) {
    // 게스트만: Session.guest()가 쓴 값 그대로
  } else {
    final blob = <String, Object?>{
      for (final e in stored.entries)
        (e.key == 'guest' ? 'isGuest' : e.key): e.value,
    };
    kv.data[key] = jsonEncode(blob);
  }
  return store;
}

class FakeUpdateChecker implements UpdateChecker {
  FakeUpdateChecker([UpdateStatus status = UpdateStatus.upToDate])
    : next = (() => status);

  FutureOr<UpdateStatus> Function() next;
  int calls = 0;

  @override
  Future<UpdateStatus> check() async {
    calls++;
    return next();
  }
}

class FakeUpdateLauncher implements UpdateLauncher {
  int calls = 0;
  Object? error;
  Completer<void>? gate;

  @override
  Future<void> launch() async {
    calls++;
    final g = gate;
    if (g != null) await g.future;
    final e = error;
    if (e != null) throw e;
  }
}

class FakeHomePreloader implements HomePreloader {
  final List<bool> calls = [];
  Completer<void> completer = Completer<void>();

  int get count => calls.length;

  @override
  Future<void> preload({required bool guest}) {
    calls.add(guest);
    return completer.future;
  }
}

class FakePushRegistrar implements PushRegistrar {
  int calls = 0;
  Object? error;

  @override
  Future<void> registerCurrentDevice() async {
    calls++;
    final e = error;
    if (e != null) throw e;
  }
}

class FakeUserDataCleaner implements UserDataCleaner {
  int calls = 0;
  void Function()? onClear;

  @override
  Future<void> clearAll() async {
    calls++;
    onClear?.call();
  }
}

class FakeNonceGenerator implements NonceGenerator {
  FakeNonceGenerator([List<String>? values])
    : _values = values ?? ['raw-nonce-1', 'raw-nonce-2', 'raw-nonce-3'];

  final List<String> _values;
  int calls = 0;

  @override
  String generate() => _values[calls++ % _values.length];
}

/// 카카오 SDK 경계 Fake. 호출마다 받은 nonce를 기록한다.
class FakeSocialLoginClient implements SocialLoginClient {
  final List<String> noncesReceived = [];
  FutureOr<String> Function(String nonce) respond = (_) => 'kakao-id-token-1';

  void succeedWith(String idToken) => respond = (_) => idToken;
  void failWith(Object error) => respond = (_) => throw error;

  int get calls => noncesReceived.length;

  @override
  Future<String> requestIdToken({required String nonce}) async {
    noncesReceived.add(nonce);
    return respond(nonce);
  }
}

class FakeKakaoSdkGateway implements KakaoSdkGateway {
  final List<String> calls = [];
  bool installed = true;
  Object? installedError;
  FutureOr<String?> Function() talk = () => 'talk-id-token';
  FutureOr<String?> Function() account = () => 'account-id-token';
  final List<String> noncesReceived = [];

  @override
  Future<bool> isKakaoTalkInstalled() async {
    calls.add('isInstalled');
    final e = installedError;
    if (e != null) throw e;
    return installed;
  }

  @override
  Future<String?> loginWithKakaoTalk({required String nonce}) async {
    calls.add('talk');
    noncesReceived.add(nonce);
    return talk();
  }

  @override
  Future<String?> loginWithKakaoAccount({required String nonce}) async {
    calls.add('account');
    noncesReceived.add(nonce);
    return account();
  }
}

class FakeStoreVersionSource implements StoreVersionSource {
  FakeStoreVersionSource(this.result);

  FutureOr<String?> Function() result;
  int calls = 0;

  @override
  Future<String?> fetchLatestVersion() async {
    calls++;
    return result();
  }
}

class FakePlayUpdateSource implements PlayUpdateSource {
  FakePlayUpdateSource([this.info]);

  PlayUpdateInfo? info;
  Object? fetchError;
  int fetchCalls = 0;
  int startCalls = 0;
  Object? startError;

  @override
  Future<PlayUpdateInfo> fetchInfo() async {
    fetchCalls++;
    final e = fetchError;
    if (e != null) throw e;
    return info!;
  }

  @override
  Future<void> startImmediateUpdate() async {
    startCalls++;
    final e = startError;
    if (e != null) throw e;
  }
}

/// 서버 대신 스크립트로 답하는 AuthRepository(취소·세밀한 오류 주입용).
class FakeAuthRepository implements AuthRepository {
  FutureOr<SocialLoginResponse> Function() onSocialLogin = () =>
      const SocialLoginSignUpRequired();
  FutureOr<void> Function() onLogout = () {};
  FutureOr<void> Function() onDelete = () {};
  final List<String> logoutTokens = [];
  int deleteCalls = 0;

  @override
  Future<SocialLoginResponse> socialLogin({
    required String idToken,
    required String rawNonce,
    CancelToken? cancelToken,
  }) async => onSocialLogin();

  @override
  Future<void> logout({required String refreshToken}) async {
    logoutTokens.add(refreshToken);
    await onLogout();
  }

  @override
  Future<void> deleteAccount() async {
    deleteCalls++;
    await onDelete();
  }
}

/// 실제 ApiClient + FakeAdapter + SessionManager 묶음(저장소는 메모리).
class AuthHttpHarness {
  AuthHttpHarness({Session? session, String baseUrl = apiHost})
    : store = FakeTokenStore(session) {
    sessions = SessionManager(store: store);
    client = ApiClient(
      config: ApiConfig.parse(baseUrl),
      sessions: sessions,
      adapter: adapter,
      logSink: logs,
    );
    sessions.cleared.listen(clearedReasons.add);
  }

  final FakeAdapter adapter = FakeAdapter();
  final FakeTokenStore store;
  final FakeLogSink logs = FakeLogSink();
  final List<SessionClearReason> clearedReasons = [];
  late final SessionManager sessions;
  late final ApiClient client;

  static const socialLoginPath = '$v1/auth/social-login';
  static const logoutPath = '$v1/auth/logout';
  static const refreshPath = '$v1/auth/refresh';
  static const deleteMePath = '$v1/users/me';

  void onSocialLogin(String fixture) =>
      adapter.on('POST', socialLoginPath, [fixtureResponse(fixture)]);
}
