import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/record/domain/record_models.dart';
import 'package:chalkak/features/record/domain/record_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart' show fakeTestAt;
import '../../../support/record_fakes.dart';

const _oct = KstMonth(2026, 10);
const _sep = KstMonth(2026, 9);
const _aug = KstMonth(2026, 8);

FakeResponse _monthsJson(List<(int, int)> months) => FakeResponse.json(200, {
  'months': [
    for (final (y, m) in months) {'year': y, 'month': m},
  ],
});

void main() {
  group('진입과 현재 달', () {
    fakeTest('TC-REC-001 진입하면 월 목록과 KST 현재 달 달력을 부르고 Loading에서 Content로 바뀐다', (
      async,
    ) {
      final r = RecordRig();
      r.vm.enter();
      expect(r.state.content, isA<RecordLoading>());
      expect(r.state.selectedMonth, _oct);
      r.pass(async);
      expect(r.api.monthsCalls, 1);
      expect(r.api.calendarRequested, ['2026-10']);
      final content = r.state.content as RecordReady;
      expect(content.isRevalidating, isFalse);
      expect(content.photos, hasLength(3));
      expect(r.state.currentMonth, _oct);
      expect(r.state.today, const KstDate(2026, 10, 27));
    });

    fakeTest('TC-REC-002 월 선택지는 서버 목록과 현재 달의 합집합이며 최신순이다', (async) {
      final r = RecordRig();
      r.enter(async);
      expect(r.state.availableMonths, [_oct, _sep]);
    });

    fakeTest('TC-REC-002 월 목록이 비어 있어도 오류 없이 현재 달만 선택지에 있다', (async) {
      final r = RecordRig();
      r.api.months([fx('record/posts-calendar-months__empty.json')]);
      r.enter(async);
      expect(r.state.availableMonths, [_oct]);
      expect(r.state.content, isA<RecordReady>());
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('TC-REC-003 월 목록에 현재 달이 없어도 선택지에 포함된다', (async) {
      final r = RecordRig();
      r.api.months([fx('record/posts-calendar-months__without-current.json')]);
      r.enter(async);
      expect(r.state.availableMonths, [_oct, _sep]);
      expect(r.state.selectedMonth, _oct);
    });

    fakeTest('REQ-REC-008 월 목록 조회가 실패해도 현재 달 조회는 계속하고 토스트는 없다', (async) {
      final r = RecordRig();
      r.api.months(failing('common/error__internal-500.json'));
      r.enter(async);
      expect(r.state.availableMonths, [_oct]);
      expect(r.state.content, isA<RecordReady>());
      expect(r.toast.messages, isEmpty);
    });

    fakeTestAt(
      'TC-REC-005 KST 월말 23:59:59에는 2026-10을 현재 달로 조회한다',
      DateTime.utc(2026, 10, 31, 14, 59, 59),
      (async) {
        final r = RecordRig(now: DateTime.utc(2026, 10, 31, 14, 59, 59));
        r.enter(async, wait: const Duration(milliseconds: 100));
        expect(r.state.currentMonth, _oct);
        expect(r.state.selectedMonth, _oct);
        expect(r.api.calendarRequested, ['2026-10']);
      },
    );

    fakeTestAt(
      'TC-REC-005 KST 자정(15:00:00Z)에는 2026-11을 현재 달로 조회하고 선택지에 넣는다',
      DateTime.utc(2026, 10, 31, 15),
      (async) {
        final r = RecordRig(now: DateTime.utc(2026, 10, 31, 15));
        r.api.calendar(2026, 11, [
          fx('record/posts-calendar__2026-11-empty.json'),
        ]);
        r.enter(async, wait: const Duration(milliseconds: 100));
        expect(r.state.currentMonth, const KstMonth(2026, 11));
        expect(r.state.selectedMonth, const KstMonth(2026, 11));
        expect(r.state.availableMonths, [const KstMonth(2026, 11), _oct, _sep]);
        expect(r.api.calendarRequested, ['2026-11']);
      },
    );

    fakeTestAt(
      'TC-REC-006 연말 KST 23:59:59는 2026-12, 15:00:00Z는 2027-01이 현재 달이다',
      DateTime.utc(2026, 12, 31, 14, 59, 59),
      (async) {
        final r = RecordRig(now: DateTime.utc(2026, 12, 31, 14, 59, 59));
        r.enter(async, wait: const Duration(milliseconds: 100));
        expect(r.state.currentMonth, const KstMonth(2026, 12));
        async.elapse(const Duration(seconds: 2));
        r.vm.onForeground();
        r.pass(async);
        expect(r.state.currentMonth, const KstMonth(2027, 1));
        expect(r.state.availableMonths.first, const KstMonth(2027, 1));
      },
    );

    fakeTestAt(
      'TC-REC-007 프로세스를 유지한 채 월이 바뀌면 처음 들어올 때 새 현재 달(2026-11)을 고른다',
      DateTime.utc(2026, 10, 31, 14, 59, 59),
      (async) {
        final r = RecordRig(now: DateTime.utc(2026, 10, 31, 14, 59, 59));
        r.api.calendar(2026, 11, [
          fx('record/posts-calendar__2026-11-empty.json'),
        ]);
        // 프로세스 시작 시점에 한 번 계산해 고정하면 여기서 10월이 남는다.
        expect(r.vm, isNotNull);
        async.elapse(const Duration(seconds: 2));
        r.enter(async);
        expect(r.state.currentMonth, const KstMonth(2026, 11));
        expect(r.state.selectedMonth, const KstMonth(2026, 11));
        expect(r.api.calendarRequested, ['2026-11']);
      },
    );

    fakeTestAt(
      'TC-REC-007 REQ-REC-007 보던 중 월이 바뀌면 재진입·복귀에서 선택지만 다시 계산하고 보던 달과 날짜는 유지한다',
      DateTime.utc(2026, 10, 31, 14, 59, 59),
      (async) {
        final r = RecordRig(now: DateTime.utc(2026, 10, 31, 14, 59, 59));
        r.api.calendar(2026, 11, [
          fx('record/posts-calendar__2026-11-empty.json'),
        ]);
        r.enter(async);
        r.vm.selectDate(const KstDate(2026, 10, 20));
        async.elapse(const Duration(seconds: 2)); // KST 11/01 00:00:01
        r.vm.enter();
        r.pass(async);
        expect(r.state.currentMonth, const KstMonth(2026, 11));
        expect(r.state.availableMonths.first, const KstMonth(2026, 11));
        expect(r.state.selectedMonth, _oct);
        expect(r.state.selectedDate, const KstDate(2026, 10, 20));
        expect(r.api.calendarRequested.where((k) => k == '2026-11'), isEmpty);

        r.vm.onForeground();
        r.pass(async);
        expect(r.state.selectedMonth, _oct);
        expect(r.state.selectedDate, const KstDate(2026, 10, 20));
      },
    );
  });

  group('월 이동', () {
    fakeTest('TC-REC-004 기록이 없는 달(선택지 안)으로 이동하면 빈 달로 표시되고 오류가 아니다', (async) {
      final r = RecordRig();
      r.api.months([
        _monthsJson([(2026, 10), (2026, 9), (2026, 8)]),
      ]);
      r.api.calendar(2026, 8, [
        fx('record/posts-calendar__2026-08-empty.json'),
      ]);
      r.enter(async);
      r.vm.selectMonth(_aug);
      r.pass(async);
      expect(r.state.selectedMonth, _aug);
      final content = r.state.content as RecordReady;
      expect(content.photos, isEmpty);
      expect(r.state.selectedDate, isNull);
      expect(r.state.selectedPhoto, isNull);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest(
      'TC-REC-016 이전·다음 달은 해당 월 calendar를 요청하고 처음 가는 달은 기존 기록을 비우고 로딩한다',
      (async) {
        final r = RecordRig();
        r.api.calendar(2026, 9, [
          fx(
            'record/posts-calendar__2026-09.json',
            delay: const Duration(seconds: 1),
          ),
        ]);
        r.enter(async);
        expect(r.state.canGoPrevious, isTrue);
        expect(r.state.canGoNext, isFalse);

        r.vm.goToPreviousMonth();
        expect(r.state.selectedMonth, _sep);
        expect(r.state.content, isA<RecordLoading>());
        r.pass(async);
        expect(r.api.calendarRequested, ['2026-10', '2026-9']);
        expect((r.state.content as RecordReady).photos, hasLength(2));
        expect(r.state.canGoPrevious, isFalse, reason: '선택지의 가장 오래된 달');
        expect(r.state.canGoNext, isTrue);

        r.vm.goToNextMonth();
        expect(r.state.selectedMonth, _oct);
        r.pass(async);
      },
    );

    fakeTest('REQ-REC-005 가장 오래된·가장 최신 달에서 화살표는 아무 일도 하지 않는다', (async) {
      final r = RecordRig();
      r.enter(async);
      r.vm.goToNextMonth();
      r.pass(async);
      expect(r.state.selectedMonth, _oct);
      expect(r.api.calendarRequested, ['2026-10']);
      r.vm.goToPreviousMonth();
      r.pass(async);
      r.vm.goToPreviousMonth();
      r.pass(async);
      expect(r.state.selectedMonth, _sep);
      expect(r.api.calendarRequested, ['2026-10', '2026-9']);
    });

    fakeTest('TC-REC-017 REQ-REC-006 선택지에 없는 달이나 이미 선택한 현재 달은 요청도 상태 변화도 없다', (
      async,
    ) {
      final r = RecordRig();
      r.enter(async);
      final before = r.states.length;
      r.vm.selectMonth(_oct);
      r.vm.selectMonth(_aug);
      r.vm.selectMonth(const KstMonth(2027, 1));
      r.pass(async);
      expect(r.api.calendarCalls, 1);
      expect(r.state.selectedMonth, _oct);
      expect(r.states.length, before, reason: '상태 변화 알림도 없다');
    });

    fakeTest('TC-REC-019 월 이동을 연타해도 마지막 선택 달만 표시되고 늦은 응답이 덮지 않는다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 9, [
        fx(
          'record/posts-calendar__2026-09.json',
          delay: const Duration(seconds: 3),
        ),
      ]);
      r.enter(async);
      r.vm.goToPreviousMonth(); // 9월 요청(3초 지연)
      r.pass(async, const Duration(seconds: 1));
      r.vm.goToNextMonth(); // 곧바로 10월로
      r.pass(async, const Duration(milliseconds: 500));
      expect(r.state.selectedMonth, _oct);
      expect(photoIds(r.state), ['90', '01', '91']);
      r.pass(async, const Duration(seconds: 5)); // 9월 응답이 늦게 도착
      expect(r.state.selectedMonth, _oct);
      expect(photoIds(r.state), ['90', '01', '91']);
      expect(r.state.selectedDate, const KstDate(2026, 10, 31));
    });
  });

  group('달력 내용과 선택 날짜', () {
    fakeTest('TC-REC-008 TC-REC-011 주제 날짜 칸에 배치되고 PENDING·APPROVED·빈 날을 구분한다', (
      async,
    ) {
      final r = RecordRig();
      r.enter(async);
      expect(r.state.photoOn(const KstDate(2026, 10, 31))?.postId, postOct31);
      expect(
        r.state.photoOn(const KstDate(2026, 10, 31))?.status,
        RecordPhotoStatus.approved,
      );
      expect(
        r.state.photoOn(const KstDate(2026, 10, 27))?.status,
        RecordPhotoStatus.pending,
      );
      expect(r.state.photoOn(const KstDate(2026, 10, 1)), isNull);
      expect(r.state.photoOn(const KstDate(2026, 11, 1)), isNull);
    });

    fakeTest('TC-REC-036 처음 진입하면 사용자가 정하지 않았으므로 가장 최근 기록 날짜가 선택된다', (async) {
      final r = RecordRig();
      r.enter(async);
      expect(r.state.selectedDate, const KstDate(2026, 10, 31));
      expect(r.state.selectedPhoto?.postId, postOct31);
      r.vm.goToPreviousMonth();
      r.pass(async);
      expect(r.state.selectedDate, const KstDate(2026, 9, 30));
    });

    fakeTest('REQ-REC-030 사진이 있는 날짜만 선택되고 없는 칸을 누르면 아무 일도 없다', (async) {
      final r = RecordRig();
      r.enter(async);
      r.vm.selectDate(const KstDate(2026, 10, 20));
      expect(r.state.selectedDate, const KstDate(2026, 10, 20));
      r.vm.selectDate(const KstDate(2026, 10, 2));
      r.vm.selectDate(const KstDate(2026, 11, 3));
      expect(r.state.selectedDate, const KstDate(2026, 10, 20));
    });

    fakeTest(
      'TC-REC-012 TC-REC-013 TC-REC-014 계약 위반 응답은 기록을 불러오지 못한 오류 상태이고 깨지지 않는다',
      (async) {
        for (final fixture in [
          'record/posts-calendar__month-mismatch.json',
          'record/posts-calendar__date-out-of-month.json',
          'record/posts-calendar__duplicate-date.json',
          'record/posts-calendar__empty-thumbnail.json',
          'record/posts-calendar__unknown-status.json',
        ]) {
          final r = RecordRig();
          r.api.calendar(2026, 10, [fx(fixture)]);
          r.enter(async);
          final content = r.state.content;
          expect(content, isA<RecordFailed>(), reason: fixture);
          expect((content as RecordFailed).failure, RecordFailure.other);
          expect(r.state.selectedPhoto, isNull, reason: fixture);
          expect(r.state.photoOn(const KstDate(2026, 10, 27)), isNull);
          expect(r.state.photoOn(const KstDate(2026, 10, 31)), isNull);
          expect(
            r.toast.messages,
            isEmpty,
            reason: '첫 불러오기 실패는 토스트가 아니라 오류 화면',
          );
        }
      },
    );

    fakeTest('TC-REC-015 응답 순서와 무관하게 날짜 칸에 정확히 배치된다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__2026-10-shuffled.json'),
      ]);
      r.enter(async);
      expect(photoIds(r.state), ['90', '01', '91']);
      expect(
        r.state.photoOn(const KstDate(2026, 10, 27))?.postId,
        postOct27Pending,
      );
    });
  });
}
