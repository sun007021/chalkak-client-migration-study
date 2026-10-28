import 'dart:async';

import 'package:chalkak/core/analytics/analytics_constants.dart';
import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/record/domain/record_calendar_image.dart';
import 'package:chalkak/features/record/domain/record_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart' show HomeRig;
import '../../../support/net_harness.dart';
import '../../../support/record_fakes.dart';

void main() {
  group('오류 화면 상태', () {
    fakeTest('TC-REC-030 토큰 갱신 불가 401은 로그인 필요 상태이고 "로그인 하기"는 로그인 이동을 요청한다', (
      async,
    ) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__401-unauthorized.json'),
      ]);
      r.http.adapter.on('POST', '$v1/auth/refresh', [
        fx('auth/refresh__reauthentication-required.json'),
      ]);
      r.enter(async);
      final content = r.state.content;
      expect(content, isA<RecordFailed>());
      expect((content as RecordFailed).failure, RecordFailure.unauthorized);
      expect(r.toast.messages, isEmpty);
      r.vm.onLoginPressed();
      expect(r.events.single, isA<RecordGoToLogin>());
    });

    fakeTest('TC-REC-030 401 뒤 refresh가 성공하면 1회 재전송해 정상 로드된다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__401-unauthorized.json'),
        fx('record/posts-calendar__2026-10.json'),
      ]);
      r.http.adapter.on('POST', '$v1/auth/refresh', [
        fx('auth/refresh__success.json'),
      ]);
      r.enter(async);
      expect(r.state.content, isA<RecordReady>());
      expect(r.http.adapter.count('POST', '$v1/auth/refresh'), 1);
    });

    fakeTest('TC-REC-031 서버 400은 "조회할 수 없는 연월" 오류 상태로 처리한다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__400-invalid-month.json'),
      ]);
      r.enter(async);
      final content = r.state.content;
      expect(content, isA<RecordFailed>());
      expect((content as RecordFailed).failure, RecordFailure.invalidMonth);
      expect(r.api.calendarCalls, 1, reason: '400은 재시도하지 않는다');
    });

    fakeTest('TC-REC-032 서버 500은 "기록을 불러오지 못했어요" 오류 상태이고 다시 시도하면 불러온다', (
      async,
    ) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        ...failing('record/posts-calendar__500-server-error.json'),
        fx('record/posts-calendar__2026-10.json'),
      ]);
      r.enter(async);
      expect(r.state.content, isA<RecordFailed>());
      expect((r.state.content as RecordFailed).failure, RecordFailure.other);
      r.vm.retry();
      expect(r.state.content, isA<RecordLoading>());
      r.pass(async);
      expect(r.state.content, isA<RecordReady>());
    });
  });

  group('게스트·분석', () {
    fakeTest('TC-REC-033 게스트가 기록 탭을 누르면 토스트만 뜨고 탭은 안 바뀌며 요청이 0건이다', (async) {
      final r = HomeRig(guest: true);
      r.shell.start();
      r.shell.selectTab(BottomDestination.record);
      settle(async);
      expect(r.toast.messages, [Copy.recordGuest]);
      expect(r.shell.selected, BottomDestination.home);
      expect(r.api.totalCalls, 0);
    });

    fakeTest('TC-REC-042 기록 탭이 선택되면 screen_view record를 1회 보낸다', (async) {
      final r = HomeRig();
      r.shell.start();
      r.shell.selectTab(BottomDestination.record);
      expect(r.analytics.screenNames.where((n) => n == 'record'), hasLength(1));
      expect(r.analytics.destinations, ['record']);
    });
  });

  group('선택한 날짜의 동작', () {
    fakeTest('TC-REC-034 APPROVED 사진의 피드·전시 동작이 해당 목적지 이동을 요청한다', (async) {
      final r = RecordRig();
      r.enter(async);
      expect(r.state.selectedDate, const KstDate(2026, 10, 31));
      r.vm.onViewFeedPressed();
      r.vm.onViewDisplayPressed();
      expect(r.events, hasLength(2));
      final feed = r.events[0] as RecordOpenFeed;
      expect(feed.photo.postId, postOct31);
      expect(feed.photo.thumbnailImageUrl, contains(postOct31));
      expect(
        (r.events[1] as RecordOpenDisplay).date,
        const KstDate(2026, 10, 31),
      );
    });

    fakeTest('TC-REC-035 REQ-REC-033 PENDING은 동작 이벤트를 내지 않고 상세 API도 부르지 않는다', (
      async,
    ) {
      final r = RecordRig();
      r.enter(async);
      r.vm.selectDate(const KstDate(2026, 10, 27));
      expect(r.state.selectedPhoto?.isPending, isTrue);
      r.vm.onViewFeedPressed();
      r.vm.onViewDisplayPressed();
      r.pass(async);
      expect(r.events, isEmpty);
      expect(r.api.postDetailCalls, 0);
    });

    fakeTest('REQ-REC-015 "사진 반영 중" 배지를 누르면 안내 풍선이 열리고 다시 누르면 닫힌다', (async) {
      final r = RecordRig();
      r.enter(async);
      r.vm.selectDate(const KstDate(2026, 10, 27));
      expect(r.state.isPendingTooltipOpen, isFalse);
      r.vm.togglePendingTooltip();
      expect(r.state.isPendingTooltipOpen, isTrue);
      r.vm.togglePendingTooltip();
      expect(r.state.isPendingTooltipOpen, isFalse);
    });
  });

  group('달력 이미지 저장', () {
    fakeTest(
      'TC-REC-038 현재 달을 PNG로 렌더해 chalkak-calendar-2026-10.png로 저장하고 토스트가 한 번 뜬다',
      (async) {
        final r = RecordRig();
        r.enter(async);
        r.vm.saveCalendarImage();
        r.pass(async);
        expect(r.renderer.specs.single.month, const KstMonth(2026, 10));
        expect(r.renderer.specs.single.photos, hasLength(3));
        expect(r.saver.fileNames, ['chalkak-calendar-2026-10.png']);
        expect(r.saver.saved.single.take(4), [0x89, 0x50, 0x4E, 0x47]);
        expect(r.toast.messages, [Copy.recordSaveOk]);
        expect(r.state.isSaving, isFalse);
      },
    );

    fakeTest('TC-REC-038 다른 달을 보고 있으면 그 달의 파일명으로 저장한다', (async) {
      final r = RecordRig();
      r.enter(async);
      r.vm.goToPreviousMonth();
      r.pass(async);
      r.vm.saveCalendarImage();
      r.pass(async);
      expect(r.saver.fileNames, ['chalkak-calendar-2026-09.png']);
    });

    fakeTest('TC-REC-039 권한 거부와 쓰기 실패는 각각의 토스트를 띄우고 앱이 멈추지 않는다', (async) {
      final r = RecordRig();
      r.enter(async);

      r.saver.error = const CalendarImagePermissionDenied();
      r.vm.saveCalendarImage();
      r.pass(async);
      expect(r.toast.messages, [Copy.recordSaveDenied]);
      expect(r.state.isSaving, isFalse);

      r.saver.error = StateError('디스크 가득 참');
      r.vm.saveCalendarImage();
      r.pass(async);
      expect(r.toast.messages.last, Copy.recordSaveFail);

      r.saver.error = null;
      r.renderer.error = StateError('렌더 실패');
      r.vm.saveCalendarImage();
      r.pass(async);
      expect(r.toast.messages.last, Copy.recordSaveFail);
      expect(r.state.isSaving, isFalse);

      r.renderer.error = null;
      r.vm.saveCalendarImage();
      r.pass(async);
      expect(r.toast.messages.last, Copy.recordSaveOk);
    });

    fakeTest('TC-REC-040 저장 중에 버튼을 연타해도 저장은 1회만 실행된다', (async) {
      final r = RecordRig();
      r.enter(async);
      final gate = Completer<void>();
      r.saver.gate = gate;
      r.vm.saveCalendarImage();
      r.pass(async, const Duration(milliseconds: 100));
      expect(r.state.isSaving, isTrue);
      r.vm.saveCalendarImage();
      r.vm.saveCalendarImage();
      r.pass(async, const Duration(milliseconds: 100));
      gate.complete();
      r.pass(async);
      expect(r.saver.calls, 1);
      expect(r.renderer.specs, hasLength(1));
      expect(r.toast.messages, [Copy.recordSaveOk]);
      expect(r.state.isSaving, isFalse);
    });
  });
}
