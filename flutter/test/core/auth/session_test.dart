import 'package:chalkak/core/auth/session.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final base = DateTime.utc(2026, 10, 27, 3);
  Session make({Duration access = const Duration(minutes: 15)}) => Session(
    userId: 'u1',
    accessToken: 'at',
    accessTokenExpiresAt: base.add(access),
    refreshToken: 'rt',
    refreshTokenExpiresAt: base.add(const Duration(days: 30)),
  );

  test('TC-AUTH-052 세션 6종이 JSON으로 왕복된다', () {
    final s = make();
    final back = Session.fromJson(s.toJson());
    expect(back.userId, 'u1');
    expect(back.accessToken, 'at');
    expect(back.accessTokenExpiresAt, s.accessTokenExpiresAt);
    expect(back.refreshToken, 'rt');
    expect(back.refreshTokenExpiresAt, s.refreshTokenExpiresAt);
    expect(back.isGuest, isFalse);
  });

  test('TC-AUTH-052 게스트 플래그가 왕복된다', () {
    final back = Session.fromJson(Session.guest().toJson());
    expect(back.isGuest, isTrue);
  });

  test('TC-AUTH-054 access 만료는 만료 시각이 now 이하일 때다', () {
    expect(
      make(access: const Duration(seconds: 1)).isAccessExpired(base),
      isFalse,
    );
    expect(make(access: Duration.zero).isAccessExpired(base), isTrue);
    expect(
      make(access: const Duration(seconds: -1)).isAccessExpired(base),
      isTrue,
    );
  });

  test('TC-NET-018 refresh 만료도 now 이하이면 만료다', () {
    final s = Session(
      userId: 'u',
      accessToken: 'a',
      accessTokenExpiresAt: base,
      refreshToken: 'r',
      refreshTokenExpiresAt: base,
    );
    expect(s.isRefreshExpired(base), isTrue);
    expect(
      s.isRefreshExpired(base.subtract(const Duration(seconds: 1))),
      isFalse,
    );
  });

  test('TC-AUTH-052 필수 필드가 빠진 JSON은 FormatException이다', () {
    expect(() => Session.fromJson({'userId': 'u'}), throwsFormatException);
  });
}
