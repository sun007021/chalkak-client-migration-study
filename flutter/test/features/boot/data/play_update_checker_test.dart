import 'package:chalkak/features/boot/data/play_update_checker.dart';
import 'package:chalkak/features/boot/domain/update_checker.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fixtures.dart';

PlayUpdateInfo _info(String fixture) {
  final d = ((Fixture.load(fixture) as Map)['data'] as Map)
      .cast<String, Object?>();
  return PlayUpdateInfo(
    updateAvailable: d['updateAvailability'] == 'UPDATE_AVAILABLE',
    priority: d['updatePriority']! as int,
    immediateAllowed: d['isImmediateUpdateAllowed']! as bool,
  );
}

void main() {
  test('TC-BOOT-030 우선순위 1 이상이면 업데이트 필요', () async {
    final src = FakePlayUpdateSource(
      _info('boot/play-update__priority-1.json'),
    );
    expect(
      await PlayUpdateChecker(source: src).check(),
      UpdateStatus.updateRequired,
    );
  });

  test('TC-BOOT-030 우선순위 0이면 통과', () async {
    final src = FakePlayUpdateSource(
      _info('boot/play-update__priority-0.json'),
    );
    expect(await PlayUpdateChecker(source: src).check(), UpdateStatus.upToDate);
  });

  test('TC-BOOT-030 우선순위가 높아도 업데이트가 없으면 통과', () async {
    final src = FakePlayUpdateSource(
      const PlayUpdateInfo(
        updateAvailable: false,
        priority: 5,
        immediateAllowed: true,
      ),
    );
    expect(await PlayUpdateChecker(source: src).check(), UpdateStatus.upToDate);
  });

  test('TC-BOOT-030 즉시 업데이트가 허용되지 않으면 막지 않고 통과', () async {
    final src = FakePlayUpdateSource(
      const PlayUpdateInfo(
        updateAvailable: true,
        priority: 3,
        immediateAllowed: false,
      ),
    );
    expect(await PlayUpdateChecker(source: src).check(), UpdateStatus.upToDate);
  });

  test('TC-BOOT-011 TC-BOOT-023 조회 예외는 unavailable(통과)이다', () async {
    final src = FakePlayUpdateSource()
      ..fetchError = Exception('play unavailable');
    expect(
      await PlayUpdateChecker(source: src).check(),
      UpdateStatus.unavailable,
    );
  });

  test('TC-BOOT-029 launcher는 즉시 업데이트를 정확히 시작한다', () async {
    final src = FakePlayUpdateSource();
    await PlayUpdateLauncher(source: src).launch();
    expect(src.startCalls, 1);
  });

  test('TC-BOOT-031 즉시 업데이트가 취소·실패하면 예외를 그대로 알린다', () async {
    final src = FakePlayUpdateSource()..startError = Exception('cancelled');
    await expectLater(
      PlayUpdateLauncher(source: src).launch(),
      throwsException,
    );
  });
}
