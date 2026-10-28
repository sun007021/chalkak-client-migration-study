import 'dart:async';

import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/record/domain/record_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/record_fakes.dart';

const _oct = KstMonth(2026, 10);
const _sep = KstMonth(2026, 9);

void main() {
  group('화면이 사라지거나 계정이 바뀌는 동안의 비동기 응답', () {
    fakeTest('TC-REC-027 dispose 뒤에 늦게 도착한 응답은 상태도 알림도 만들지 않는다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx(
          'record/posts-calendar__2026-10.json',
          delay: const Duration(seconds: 3),
        ),
      ]);
      r.vm.enter();
      r.pass(async, const Duration(seconds: 1));
      final before = r.states.length;
      r.vm.dispose();
      r.pass(async, const Duration(seconds: 5));
      expect(r.states.length, before);
      expect(r.toast.messages, isEmpty);
      // 삭제 이벤트·사용자 동작도 dispose 뒤에는 조용히 무시한다.
      r.postEvents.remove(postOct31);
      r.vm.onViewFeedPressed();
      r.vm.selectDate(const KstDate(2026, 10, 20));
      expect(r.events, isEmpty);
    });

    fakeTest('TC-REC-040 저장 중 dispose하면 결과 토스트를 띄우지 않는다', (async) {
      final r = RecordRig();
      r.enter(async);
      final gate = Completer<void>();
      r.saver.gate = gate;
      r.vm.saveCalendarImage();
      r.pass(async, const Duration(milliseconds: 100));
      r.vm.dispose();
      gate.complete();
      r.pass(async);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('TC-REC-028 저장 중 계정이 바뀌면 이전 계정의 저장 결과를 알리지 않고 새 저장이 가능하다', (
      async,
    ) {
      final r = RecordRig();
      r.enter(async);
      final gate = Completer<void>();
      r.saver.gate = gate;
      r.vm.saveCalendarImage();
      r.pass(async, const Duration(milliseconds: 100));
      expect(r.state.isSaving, isTrue);
      r.vm.clearAll();
      expect(r.state.isSaving, isFalse);
      gate.complete();
      r.pass(async);
      expect(r.toast.messages, isEmpty, reason: '이전 계정 요청의 결과는 버린다');
      expect(r.state.isSaving, isFalse);

      r.saver.gate = null;
      r.enter(async);
      r.vm.saveCalendarImage();
      r.pass(async);
      expect(r.toast.messages, hasLength(1));
    });

    fakeTest('TC-REC-040 달이 아직 불러와지지 않았으면 저장은 아무 일도 하지 않는다', (async) {
      final r = RecordRig();
      r.vm.enter();
      r.vm.saveCalendarImage();
      r.pass(async);
      r.vm.clearAll();
      r.vm.saveCalendarImage();
      expect(r.renderer.specs, isEmpty);
      expect(r.saver.calls, 0);
    });
  });

  group('요청 중복과 취소', () {
    fakeTest('TC-REC-025 월 목록·달 요청이 진행 중이면 enter를 거듭해도 다시 보내지 않는다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx(
          'record/posts-calendar__2026-10.json',
          delay: const Duration(seconds: 2),
        ),
      ]);
      r.vm.enter();
      r.vm.onForeground();
      r.vm.enter();
      r.pass(async, const Duration(seconds: 5));
      expect(r.api.monthsCalls, 1);
      expect(r.api.calendarCalls, 1);
      expect(r.state.content, isA<RecordReady>());
    });

    fakeTest('TC-REC-019 보고 있지 않은 달의 늦은 실패는 토스트도 오류 화면도 만들지 않고 다시 열면 새로 요청한다', (
      async,
    ) {
      final r = RecordRig();
      r.api.calendar(2026, 9, [
        const FakeResponse(
          status: 400,
          body: '{"errorCode":"BUSINESS_ERROR","message":"조회 연월이 올바르지 않습니다."}',
          delay: Duration(seconds: 2),
        ),
        fx('record/posts-calendar__2026-09.json'),
      ]);
      r.enter(async);
      r.vm.goToPreviousMonth();
      r.pass(async, const Duration(milliseconds: 100));
      r.vm.goToNextMonth();
      r.pass(async, const Duration(seconds: 10));
      expect(r.state.selectedMonth, _oct);
      expect(r.state.content, isA<RecordReady>());
      expect(r.toast.messages, isEmpty);

      r.vm.goToPreviousMonth();
      expect(r.state.selectedMonth, _sep);
      expect(r.state.content, isA<RecordLoading>());
      r.pass(async);
      expect((r.state.content as RecordReady).photos, hasLength(2));
    });

    fakeTest('TC-REC-027 재검증 중 화면을 벗어나면 캐시는 그대로고 재검증 표시만 꺼진다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__2026-10.json'),
        fx(
          'record/posts-calendar__2026-10.json',
          delay: const Duration(seconds: 3),
        ),
      ]);
      r.enter(async);
      r.vm.enter();
      r.pass(async, const Duration(seconds: 1));
      expect((r.state.content as RecordReady).isRevalidating, isTrue);
      r.vm.onHidden();
      expect((r.state.content as RecordReady).isRevalidating, isFalse);
      r.pass(async, const Duration(seconds: 5));
      expect(photoIds(r.state), ['90', '01', '91']);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('TC-REC-024 홈이 요청한 날짜의 게시물이 삭제 이벤트로 사라지면 같은 달 가장 최신 사진으로 옮긴다', (
      async,
    ) {
      final r = RecordRig();
      r.enter(async, requestedDate: const KstDate(2026, 10, 27));
      expect(r.state.selectedDate, const KstDate(2026, 10, 27));
      r.postEvents.remove(postOct27Pending);
      expect(r.state.selectedDate, const KstDate(2026, 10, 31));
    });

    fakeTest('TC-REC-025 선택지에 없는 달을 홈이 요청하면 그 달을 열고 이동 화살표는 선택지 기준이다', (async) {
      final r = RecordRig();
      r.enter(async, requestedDate: const KstDate(2026, 8, 5));
      expect(r.state.selectedMonth, const KstMonth(2026, 8));
      expect(r.state.availableMonths, [_oct, _sep]);
      expect(r.state.canGoNext, isTrue);
      r.vm.goToNextMonth();
      expect(r.state.selectedMonth, _sep);
    });
  });
}
