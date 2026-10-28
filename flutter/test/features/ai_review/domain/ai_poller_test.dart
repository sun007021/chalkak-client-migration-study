import 'package:chalkak/features/ai_review/domain/ai_poller.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';

Duration _ms(int ms) => Duration(milliseconds: ms);

void main() {
  /// tick마다 응답이 즉시 온 것으로 보고 다시 예약한다.
  (AiPoller, List<Duration>, List<Duration>) build(FakeAsync async) {
    final ticks = <Duration>[];
    final timeouts = <Duration>[];
    late AiPoller poller;
    Duration elapsed() => async.elapsed;
    poller = AiPoller(
      onTick: () {
        ticks.add(elapsed());
        poller.schedule();
      },
      onTimeout: () => timeouts.add(elapsed()),
    );
    return (poller, ticks, timeouts);
  }

  fakeTest('TC-AIR-032 TC-AIR-033 첫 예약은 3.0초 뒤이고 이후 3초마다 한 번씩이다', (async) {
    final (poller, ticks, _) = build(async);
    poller.open();
    poller.schedule();
    async.elapse(_ms(2999));
    expect(ticks, isEmpty);
    async.elapse(_ms(1));
    expect(ticks, [const Duration(seconds: 3)]);
    async.elapse(const Duration(seconds: 7));
    expect(ticks.map((d) => d.inSeconds), [3, 6, 9]);
  });

  fakeTest('TC-AIR-035 299.999초까지 tick하고 300.000초에 tick 없이 timeout이다', (async) {
    final (poller, ticks, timeouts) = build(async);
    poller.open();
    poller.schedule();
    async.elapse(_ms(299999));
    expect(timeouts, isEmpty);
    expect(ticks.map((d) => d.inSeconds), [
      for (var s = 3; s <= 297; s += 3) s,
    ]);
    async.elapse(_ms(1));
    expect(timeouts, [const Duration(seconds: 300)]);
    expect(ticks, hasLength(99));
    expect(poller.isOpen, isFalse);
    async.elapse(const Duration(seconds: 60));
    expect(ticks, hasLength(99));
    expect(timeouts, hasLength(1));
  });

  fakeTest('TC-AIR-034 창 시작은 open 시각이고 이미 열려 있으면 유지, restart면 다시 잡는다', (async) {
    final (poller, _, timeouts) = build(async);
    poller.open();
    async.elapse(const Duration(seconds: 100));
    poller.open();
    poller.schedule();
    async.elapse(const Duration(seconds: 200));
    expect(timeouts, [const Duration(seconds: 300)]);

    poller.open();
    async.elapse(const Duration(seconds: 100));
    poller.open(restart: true);
    poller.schedule();
    async.elapse(const Duration(seconds: 299));
    expect(timeouts, hasLength(1));
    async.elapse(const Duration(seconds: 1));
    expect(timeouts, hasLength(2));
  });

  fakeTest('TC-AIR-035 응답이 늦어 창을 넘긴 뒤 schedule하면 즉시 timeout이다', (async) {
    final (poller, ticks, timeouts) = build(async);
    poller.open();
    async.elapse(const Duration(seconds: 301));
    poller.schedule();
    expect(timeouts, hasLength(1));
    expect(ticks, isEmpty);
  });

  fakeTest('TC-AIR-032 창이 닫혀 있으면 schedule은 아무 것도 하지 않고 pause/stop은 예약을 취소한다', (
    async,
  ) {
    final (poller, ticks, timeouts) = build(async);
    poller.schedule();
    async.elapse(const Duration(seconds: 10));
    expect(ticks, isEmpty);
    poller.open();
    poller.schedule();
    poller.pause();
    async.elapse(const Duration(seconds: 10));
    expect(ticks, isEmpty);
    expect(poller.isOpen, isTrue);
    poller.schedule();
    poller.stop();
    async.elapse(const Duration(seconds: 400));
    expect(ticks, isEmpty);
    expect(timeouts, isEmpty);
    expect(poller.isOpen, isFalse);
  });
}
