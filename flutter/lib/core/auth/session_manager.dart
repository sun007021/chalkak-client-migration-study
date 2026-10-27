import 'dart:async';

import 'session.dart';
import 'token_store.dart';

enum SessionClearReason { reauthenticationRequired, userLogout }

/// 세션 읽기·저장·지움의 단일 창구. 지움은 [cleared] 스트림으로 알려
/// 앱이 로그인 화면으로 보내게 한다. 쓰기 연산은 한 줄로 직렬화되어
/// "같을 때만 바꾸기"(compare-and-set)가 중간에 끼어들지 않는다.
class SessionManager {
  SessionManager({required this._store});

  final TokenStore _store;
  final StreamController<SessionClearReason> _cleared =
      StreamController<SessionClearReason>.broadcast();
  Future<void> _tail = Future<void>.value();

  Stream<SessionClearReason> get cleared => _cleared.stream;

  Future<Session?> read() => _store.read();

  Future<void> save(Session session) => _locked(() => _store.write(session));

  /// 저장소를 비우고 [cleared]에 사유를 한 번 낸다.
  Future<void> clear(SessionClearReason reason) => _locked(() async {
    await _store.clear();
    _cleared.add(reason);
  });

  /// 저장된 세션이 [expected]와 같은 로그인(userId, refreshToken)일 때만 지우고 true.
  /// 그 사이 다른 계정·다른 토큰으로 바뀌었으면 지우지 않고 false.
  Future<bool> clearIfCurrent(Session expected, SessionClearReason reason) =>
      _locked(() async {
        final current = await _store.read();
        if (current == null || !_sameLogin(current, expected)) return false;
        await _store.clear();
        _cleared.add(reason);
        return true;
      });

  /// 현재 저장된 세션의 refreshToken이 [previous]와 같을 때만 [next]를 저장하고
  /// true. 그 사이 로그아웃·계정 전환이 있었으면 저장하지 않고 false.
  Future<bool> saveRefreshed({
    required Session previous,
    required Session next,
  }) => _locked(() async {
    final current = await _store.read();
    if (current == null || !_sameLogin(current, previous)) return false;
    await _store.write(next);
    return true;
  });

  static bool _sameLogin(Session a, Session b) =>
      a.userId == b.userId && a.refreshToken == b.refreshToken;

  Future<T> _locked<T>(Future<T> Function() action) {
    final result = _tail.then((_) => action());
    _tail = result.then<void>((_) {}, onError: (Object _) {});
    return result;
  }
}
