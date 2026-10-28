import 'package:chalkak/core/push/jwt_claims.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fixtures.dart';
import '../../support/notification_fakes.dart';

void main() {
  test('TC-PUSH-022 session_id 클레임이 있는 토큰은 true', () {
    expect(JwtClaims.hasSessionId(jwtFx('jwt__with-session-id')), isTrue);
  });

  test('TC-PUSH-023 TC-PUSH-024 session_id 클레임이 없는 토큰은 false', () {
    expect(JwtClaims.hasSessionId(jwtFx('jwt__without-session-id')), isFalse);
  });

  test('TC-PUSH-026 잘못된 형식은 예외 없이 session_id 없음으로 취급한다', () {
    final cases =
        (Fixture.load('push/jwt__malformed.json') as Map)['cases'] as List;
    expect(cases, isNotEmpty);
    for (final c in cases) {
      final token = (c as Map)['token'] as String;
      expect(JwtClaims.hasSessionId(token), isFalse, reason: '${c['name']}');
    }
  });

  test('TC-PUSH-026 서명은 검증하지 않는다(서명 자리가 아무 값이어도 같은 결과)', () {
    final parts = jwtFx('jwt__with-session-id').split('.');
    expect(JwtClaims.hasSessionId('${parts[0]}.${parts[1]}.other'), isTrue);
  });
}
