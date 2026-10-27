import 'package:chalkak/features/boot/domain/app_version.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fixtures.dart';

void main() {
  const installed = AppVersion(1, 1, 1);

  test('TC-BOOT-019 "1.2.3"은 major.minor.patch로 읽는다', () {
    final v = AppVersion.tryParse('1.2.3')!;
    expect((v.major, v.minor, v.patch), (1, 2, 3));
  });

  test('TC-BOOT-019 "1.1"은 patch=0으로 읽는다', () {
    final v = AppVersion.tryParse('1.1')!;
    expect((v.major, v.minor, v.patch), (1, 1, 0));
  });

  test('TC-BOOT-019 fixture 표의 정상 케이스를 그대로 읽는다', () {
    final cases =
        (Fixture.load('boot/itunes-lookup__malformed.json') as Map)['cases']
            as List;
    for (final raw in cases) {
      final c = (raw as Map).cast<String, Object?>();
      if (c['parsed'] != true) continue;
      final v = AppVersion.tryParse(c['version']! as String)!;
      expect(
        (v.major, v.minor, v.patch),
        (c['major'], c['minor'], c['patch']),
        reason: c['version']! as String,
      );
    }
  });

  test('TC-BOOT-020 읽을 수 없는 문자열은 모두 파싱 실패(null)다', () {
    final cases =
        (Fixture.load('boot/itunes-lookup__malformed.json') as Map)['cases']
            as List;
    final bad = [
      for (final raw in cases)
        if ((raw as Map)['parsed'] == false) raw['version']! as String,
    ];
    expect(bad, ['1', '1.2.3.4', '1.two.3', '1.2.-1', '']);
    for (final s in bad) {
      expect(AppVersion.tryParse(s), isNull, reason: '"$s"');
    }
  });

  test('TC-BOOT-020 공백·부호·빈 조각도 파싱 실패다', () {
    for (final s in [
      '1.',
      '.1',
      '1..2',
      ' 1.2',
      '1.2 ',
      '+1.2',
      '1.2.x',
      'v1.2',
    ]) {
      expect(AppVersion.tryParse(s), isNull, reason: '"$s"');
    }
  });

  test('TC-BOOT-016 major가 높으면 업데이트 필요(2.0.0 vs 1.1.1)', () {
    expect(const AppVersion(2, 0, 0).requiresUpdateFrom(installed), isTrue);
  });

  test('TC-BOOT-017 minor가 높으면 업데이트 필요(1.2.0 vs 1.1.1)', () {
    expect(const AppVersion(1, 2, 0).requiresUpdateFrom(installed), isTrue);
  });

  test('TC-BOOT-018 patch만 높음·같음·낮음은 모두 통과', () {
    expect(const AppVersion(1, 1, 2).requiresUpdateFrom(installed), isFalse);
    expect(const AppVersion(1, 1, 1).requiresUpdateFrom(installed), isFalse);
    expect(const AppVersion(1, 0, 9).requiresUpdateFrom(installed), isFalse);
  });

  test('TC-BOOT-018 스토어 major가 더 낮으면 minor가 높아도 통과', () {
    expect(const AppVersion(0, 9, 0).requiresUpdateFrom(installed), isFalse);
  });
}
