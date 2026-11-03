import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:chalkak/features/display/presentation/display_view_model.dart';
import 'package:chalkak/features/home/domain/home_state.dart';
import 'package:chalkak/features/navigation/domain/main_shell_view_model.dart';
import 'package:chalkak/features/upload/presentation/upload_view_model.dart';
import 'package:chalkak/features/edit/domain/photo_edit.dart';
import 'package:clock/clock.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/display_fakes.dart';
import '../../support/fake_async_helpers.dart';
import '../../support/home_fakes.dart';
import '../../support/net_harness.dart';
import '../../support/upload_fakes.dart';
import '../../features/upload/presentation/upload_vm_driver.dart';

/// 서버가 시간의 권위다(D-09, 00-overview §시간): 기기 시계가 어긋나거나 자정을 지나도
/// 클라이언트는 서버가 준 topicDate·phase·404/400을 그대로 따른다.
void main() {
  final kst1am = DateTime.utc(2026, 10, 27, 16); // KST 10/28 01:00
  final kstMidnight = DateTime.utc(2026, 10, 27, 15); // KST 10/28 00:00 정각

  group('전시 날짜 이동과 서버 거절', () {
    fakeTest(
      'TC-TIME-008 기기 시계가 앞서 서버가 400 "미래의 주제는 조회할 수 없습니다."를 주면 크래시 없이 기존 전시를 유지하고 오류 토스트를 보인다',
      (async) {
        final r = DisplayRig();
        r.serveTodayRecent();
        r.repo.servePage(
          day('2026-10-26'),
          DisplaySort.popular,
          1,
          popularP1Fx,
        );
        r.vm.load();
        advance(async, Duration.zero);
        final before = r.itemIds;
        expect(r.state.status, DisplayStatus.content);

        r.repo.onTopic(day('2026-10-26'), [
          Reply.fail(errorFx('time/topics__future-400.json')),
        ]);
        r.vm.goPrevious();
        settle(async);

        expect(r.state.selectedDate, today, reason: '이동 실패 시 직전 날짜로 복원');
        expect(r.state.status, DisplayStatus.content);
        expect(r.itemIds, before);
        expect(r.state.isNavigating, isFalse);
        expect(r.toastTexts, [Copy.displayError]);
      },
    );

    fakeTest('TC-TIME-010 해당 날짜에 주제가 없으면(404) 기존 전시를 유지하고 안내 토스트를 보인다', (
      async,
    ) {
      final r = DisplayRig();
      r.serveTodayRecent();
      r.vm.load();
      advance(async, Duration.zero);
      final before = r.itemIds;

      r.repo.onTopic(day('2026-10-26'), [
        Reply.fail(errorFx('time/topics__not-found.json')),
      ]);
      r.vm.goPrevious();
      settle(async);

      expect(r.state.selectedDate, today);
      expect(r.state.status, DisplayStatus.content);
      expect(r.itemIds, before);
      expect(r.toastTexts, [Copy.displayDateMissing]);
    });
  });

  group('오늘 게시물과 주제 phase는 서버 값', () {
    fakeTest('TC-TIME-017 업로드 진입 때 고정한 topicDate는 자정이 지난 뒤 제출해도 바뀌지 않는다', (
      async,
    ) {
      final d = UploadDriver(async);
      d.startScreen();
      d.pickAndComplete();
      final pinned = d.rig.topicDate;
      final todayCalls = d.rig.home.todayCalls;
      // 진입은 자정 직전, 제출은 KST 다음 날 00:01 이후라고 본다.
      withClock(
        Clock.fixed(t0.add(const Duration(hours: 12, minutes: 1))),
        d.submit,
      );
      expect(d.rig.api.creates.single.jsonBody!['topicId'], isNotEmpty);
      expect(d.state.topicDate, pinned);
      expect(
        d.rig.home.todayCalls,
        todayCalls,
        reason: '제출 때 오늘 주제를 다시 묻지 않는다',
      );
      expect(d.events.whereType<UploadSucceeded>().single.topicDate, pinned);
      d.dispose();
    });

    fakeTestAt(
      'TC-TIME-018 자정 직후(KST 10/28 01:00)에도 posts/today의 topicDate(10/27)로 업로드를 연다',
      kst1am,
      (async) {
        final r = HomeRig(now: kst1am);
        r.api.today([fx('time/posts-today__cross-midnight.json')]);
        r.shell.onUploadPressed();
        advance(async, const Duration(seconds: 5));
        expect(
          r.shellEvents.whereType<NavigateToUpload>().single.topicDate,
          const KstDate(2026, 10, 27),
          reason: '기기 오늘(10/28)로 덮어쓰지 않는다',
        );
        expect(r.toast.messages, isEmpty);
      },
    );

    fakeTest(
      'TC-TIME-019 주제 phase는 클라이언트가 시각으로 다시 계산하지 않고 서버 값 그대로다(OPEN·BEFORE_OPEN·CLOSED)',
      (async) {
        // 기기 시각이 OPEN 주제의 endsAt 정각(= CLOSED여야 할 시각)이어도 서버 phase를 따른다.
        final endsAt = DateTime.utc(2026, 10, 27, 15);
        final r = HomeRig(now: endsAt);
        for (final c in [
          ('2026-10-27', 'time/topics__open.json', 'OPEN'),
          ('2026-10-27', 'time/topics__before-open.json', 'BEFORE_OPEN'),
          ('2026-10-26', 'time/topics__closed.json', 'CLOSED'),
        ]) {
          r.api.topic(c.$1, [fx(c.$2)]);
          final topic = resolve(
            async,
            r.fakes.home.topicOn(KstDate.parse(c.$1)),
          );
          expect(topic!.phase, c.$3, reason: c.$2);
        }
      },
    );

    fakeTestAt(
      'TC-TIME-020 인접 주제 경계 시각(A.end == B.start)에는 서버가 준 B(OPEN)를 표시한다',
      kstMidnight,
      (async) {
        final r = HomeRig(now: kstMidnight);
        r.api.topic('2026-10-28', [fx('home/topics__open-2026-10-28.json')]);
        r.api.today([fx('time/posts-today__adjacent-topic.json')]);
        r.loadHome(async);
        final s = r.home.state;
        expect(s.today, const KstDate(2026, 10, 28));
        final topic = (s.topic as TopicReady).topic;
        expect(topic.title, '골목길');
        expect(topic.phase, 'OPEN');
        expect(s.hero, isA<HeroEmpty>());
      },
    );

    fakeTest('TC-TIME-021 주제 없는 시간대의 posts/today 404는 NoOpenTopic으로 표시한다', (
      async,
    ) {
      final r = HomeRig();
      r.api.today([fx('time/posts-today__no-topic.json')]);
      r.loadHome(async);
      expect(r.home.state.hero, isA<HeroNoOpenTopic>());
      expect(r.api.todayCalls, 1, reason: '404는 재시도하지 않는다');
    });
  });

  group('업로드 URL 만료는 단조 시계', () {
    fakeTest('TC-TIME-027 만료 판정은 단조 경과(expiresIn-5초) 기준이라 기기 시계를 앞뒤로 바꿔도 같다', (
      async,
    ) {
      // 294.999초 + 벽시계 +1시간: 만료 아님.
      final early = UploadRig();
      final first = resolve(
        async,
        early.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      early.monotonic.advance(const Duration(milliseconds: 294999));
      withClock(Clock.fixed(t0.add(const Duration(hours: 1))), () {
        final again = resolve(
          async,
          early.preparer.refresh(first, photoBytes()),
        );
        expect(again.policy.uploadId, first.policy.uploadId);
      });
      expect(early.api.policyCalls, 1);

      // 295.000초 + 벽시계 -1시간: 만료.
      final late = UploadRig();
      final second = resolve(
        async,
        late.preparer.prepare(photoBytes(), PhotoEdit.identity),
      );
      late.api.policy(['posts-uploads__issued-new.json']);
      late.monotonic.advance(const Duration(seconds: 295));
      withClock(Clock.fixed(t0.subtract(const Duration(hours: 1))), () {
        final again = resolve(
          async,
          late.preparer.refresh(second, photoBytes()),
        );
        expect(again.policy.uploadId, isNot(second.policy.uploadId));
      });
      expect(late.api.policyCalls, 2);
    });
  });
}
