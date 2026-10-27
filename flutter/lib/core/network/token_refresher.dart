import 'dart:async';

import 'package:clock/clock.dart';

import '../auth/session.dart';
import '../auth/session_manager.dart';
import 'api_error.dart';
import 'api_request.dart';
import 'body_decoder.dart';
import 'http_transport.dart';

/// `POST /auth/refresh`를 single-flight로 실행한다(D-17). 같은 refresh token으로
/// 동시에 여러 번 부르면 하나만 보내고 결과를 공유한다. refresh 호출은 요청의
/// CancelToken과 분리되어 있어 한 요청이 취소돼도 계속된다.
class TokenRefresher {
  TokenRefresher({
    required this._transport,
    required this._sessions,
    required this._apiRoot,
  });

  final HttpTransport _transport;
  final SessionManager _sessions;
  final Uri _apiRoot;
  ({String refreshToken, Future<Session> future})? _inflight;

  /// [stale]의 refresh token으로 새 세션을 받아 저장하고 돌려준다.
  /// 저장 전에 로그아웃·계정 전환이 있었으면 저장하지 않고 cancelled 오류.
  Future<Session> refresh(Session stale) {
    final running = _inflight;
    if (running != null && running.refreshToken == stale.refreshToken) {
      return running.future;
    }
    final future = _run(stale);
    _inflight = (refreshToken: stale.refreshToken, future: future);
    return future;
  }

  Future<Session> _run(Session stale) async {
    try {
      return await _exchange(stale);
    } finally {
      if (_inflight?.refreshToken == stale.refreshToken) _inflight = null;
    }
  }

  Future<Session> _exchange(Session stale) async {
    final RawResponse raw;
    try {
      raw = await _transport.send(
        TransportRequest(
          method: HttpMethod.post,
          uri: _apiRoot.replace(path: '${_apiRoot.path}/auth/refresh'),
          headers: const {'Accept': 'application/json'},
          jsonBody: {'refreshToken': stale.refreshToken},
        ),
      );
    } on ApiError catch (e) {
      if (e.isReauthenticationRequired) {
        await _sessions.clearIfCurrent(
          stale,
          SessionClearReason.reauthenticationRequired,
        );
      }
      rethrow;
    }
    final now = clock.now();
    final next = BodyDecoder.decode<Session>(raw, (json) {
      final map = json! as Map;
      return Session(
        userId: stale.userId,
        accessToken: map['accessToken']! as String,
        accessTokenExpiresAt: now.add(
          Duration(seconds: map['expiresIn']! as int),
        ),
        refreshToken: map['refreshToken']! as String,
        refreshTokenExpiresAt: now.add(
          Duration(seconds: map['refreshTokenExpiresIn']! as int),
        ),
      );
    });
    final saved = await _sessions.saveRefreshed(previous: stale, next: next);
    if (!saved) throw ApiError.cancelled();
    return next;
  }
}
