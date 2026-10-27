import 'package:chalkak/features/boot/data/itunes_update_checker.dart';
import 'package:chalkak/features/boot/domain/app_version.dart';
import 'package:chalkak/features/boot/domain/update_checker.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fixtures.dart';

const _installed = AppVersion(1, 1, 1);

Future<UpdateStatus> _check(FakeStoreVersionSource s) =>
    ItunesUpdateChecker(source: s, installed: _installed).check();

String _versionOf(String fixture) =>
    ((Fixture.load(fixture) as Map)['results'] as List)
            .cast<Map<String, Object?>>()
            .single['version']!
        as String;

void main() {
  test('TC-BOOT-016 스토어 2.0.0, 앱 1.1.1이면 업데이트 필요', () async {
    final s = FakeStoreVersionSource(
      () => _versionOf('boot/itunes-lookup__newer-major.json'),
    );
    expect(await _check(s), UpdateStatus.updateRequired);
  });

  test('TC-BOOT-017 스토어 1.2.0, 앱 1.1.1이면 업데이트 필요', () async {
    final s = FakeStoreVersionSource(
      () => _versionOf('boot/itunes-lookup__newer-minor.json'),
    );
    expect(await _check(s), UpdateStatus.updateRequired);
  });

  test('TC-BOOT-018 patch만 높음(1.1.2)·같음(1.1.1)·낮음(1.0.9)은 통과', () async {
    for (final v in [
      _versionOf('boot/itunes-lookup__patch-only.json'),
      _versionOf('boot/itunes-lookup__same.json'),
      '1.0.9',
    ]) {
      expect(
        await _check(FakeStoreVersionSource(() => v)),
        UpdateStatus.upToDate,
        reason: v,
      );
    }
  });

  test('TC-BOOT-020 파싱 실패한 버전 문자열은 unavailable(통과)이다', () async {
    for (final v in ['1', '1.2.3.4', '1.two.3', '1.2.-1', '']) {
      expect(
        await _check(FakeStoreVersionSource(() => v)),
        UpdateStatus.unavailable,
        reason: '"$v"',
      );
    }
  });

  test('TC-BOOT-022 결과 없음(null)은 unavailable(통과)이다', () async {
    expect(
      await _check(FakeStoreVersionSource(() => null)),
      UpdateStatus.unavailable,
    );
  });

  test('TC-BOOT-023 조회 예외는 던지지 않고 unavailable(통과)이다', () async {
    expect(
      await _check(FakeStoreVersionSource(() => throw Exception('offline'))),
      UpdateStatus.unavailable,
    );
  });
}
