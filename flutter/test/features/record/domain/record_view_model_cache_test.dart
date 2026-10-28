import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/record/domain/record_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/record_fakes.dart';

const _oct = KstMonth(2026, 10);
const _sep = KstMonth(2026, 9);

FakeResponse _calendarJson(
  int year,
  int month,
  List<(String date, String id, String status)> posts, {
  Duration delay = Duration.zero,
}) => FakeResponse.json(200, {
  'year': year,
  'month': month,
  'posts': [
    for (final (date, id, status) in posts)
      {
        'topicDate': date,
        'postId': id,
        'thumbnailImageUrl':
            'https://cdn.example.test/posts/$id/thumbnail.webp',
        'status': status,
      },
  ],
}, delay: delay);

List<FakeResponse> _offline() =>
    List.filled(3, const FakeResponse.fault(FakeFault.disconnect));

void main() {
  group('캐시와 재검증', () {
    fakeTest('TC-REC-020 이전에 본 달은 응답 전에도 캐시를 보여 주고 최신 값으로 교체한다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 9, [
        fx('record/posts-calendar__2026-09.json'),
        _calendarJson(2026, 9, [
          ('2026-09-17', postSep17, 'APPROVED'),
        ], delay: const Duration(seconds: 2)),
      ]);
      r.enter(async);
      r.vm.goToPreviousMonth();
      r.pass(async);
      r.vm.goToNextMonth();
      r.pass(async);

      r.vm.goToPreviousMonth();
      final cached = r.state.content as RecordReady;
      expect(cached.isRevalidating, isTrue);
      expect(cached.photos, hasLength(2), reason: '응답 전에 캐시 표시');
      r.pass(async, const Duration(seconds: 3));
      final fresh = r.state.content as RecordReady;
      expect(fresh.isRevalidating, isFalse);
      expect(fresh.photos.map((p) => p.postId), [postSep17]);
    });

    fakeTest('TC-REC-021 캐시된 달의 재조회가 실패하면 캐시를 유지하고 토스트를 띄운다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 9, [
        fx('record/posts-calendar__2026-09.json'),
        ...failing('record/posts-calendar__500-server-error.json'),
      ]);
      r.enter(async);
      r.vm.goToPreviousMonth();
      r.pass(async);
      r.vm.goToNextMonth();
      r.pass(async);
      r.vm.goToPreviousMonth();
      r.pass(async);
      final content = r.state.content as RecordReady;
      expect(content.photos, hasLength(2));
      expect(content.isRevalidating, isFalse);
      expect(r.toast.messages, [Copy.recordErrOther]);
    });

    fakeTest('TC-REC-021 처음 가는 달의 실패는 오류 + 다시 시도이고 이전 달 내용이 남지 않는다', (async) {
      final r = RecordRig();
      r.api.calendar(
        2026,
        9,
        failing('record/posts-calendar__500-server-error.json'),
      );
      r.enter(async);
      r.vm.goToPreviousMonth();
      r.pass(async);
      final content = r.state.content;
      expect(content, isA<RecordFailed>());
      expect((content as RecordFailed).failure, RecordFailure.other);
      expect(r.state.selectedPhoto, isNull);
      expect(r.state.photoOn(const KstDate(2026, 10, 31)), isNull);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('TC-REC-021 현재 달 첫 조회 실패에도 오류 상태이고 선택 날짜가 없다', (async) {
      final r = RecordRig();
      r.api.calendar(
        2026,
        10,
        failing('record/posts-calendar__500-server-error.json'),
      );
      r.enter(async);
      expect(r.state.content, isA<RecordFailed>());
      expect(r.state.selectedDate, isNull);
    });

    fakeTest('TC-REC-022 재진입하면 기존 기록을 유지하다 성공한 최신 값으로 교체한다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__2026-10.json'),
        fx(
          'record/posts-calendar__2026-10-after-delete.json',
          delay: const Duration(seconds: 2),
        ),
      ]);
      r.enter(async);
      r.vm.enter();
      r.pass(async, const Duration(seconds: 1));
      final during = r.state.content as RecordReady;
      expect(during.isRevalidating, isTrue);
      expect(during.photos, hasLength(3), reason: '응답 전에는 기존 기록 유지');
      r.pass(async, const Duration(seconds: 3));
      final after = r.state.content as RecordReady;
      expect(after.isRevalidating, isFalse);
      expect(photoIds(r.state), ['90', '91']);
    });

    fakeTest('TC-REC-022 재검증이 실패하면 기존 기록을 유지한다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__2026-10.json'),
        ...failing('record/posts-calendar__500-server-error.json'),
      ]);
      r.enter(async);
      r.vm.onForeground();
      r.pass(async);
      expect(photoIds(r.state), ['90', '01', '91']);
      expect((r.state.content as RecordReady).isRevalidating, isFalse);
      expect(r.toast.messages, [Copy.recordErrOther]);
    });

    fakeTest('TC-REC-023 재검증·교체에도 사용자가 고른 날짜가 유지된다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__2026-10.json'),
        fx(
          'record/posts-calendar__2026-10.json',
          delay: const Duration(seconds: 2),
        ),
      ]);
      r.enter(async);
      r.vm.selectDate(const KstDate(2026, 10, 20));
      r.vm.enter();
      r.pass(async, const Duration(seconds: 1));
      expect(r.state.selectedDate, const KstDate(2026, 10, 20));
      r.pass(async, const Duration(seconds: 3));
      expect(r.state.selectedDate, const KstDate(2026, 10, 20));
    });

    fakeTest('REQ-REC-023 새 응답에 그 날짜가 없으면 기본 선택(가장 최근 날짜)으로 간다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__2026-10.json'),
        fx('record/posts-calendar__2026-10-after-delete.json'),
      ]);
      r.enter(async);
      r.vm.selectDate(const KstDate(2026, 10, 27));
      r.vm.onForeground();
      r.pass(async);
      expect(r.state.selectedDate, const KstDate(2026, 10, 31));
    });
  });

  group('삭제한 게시물 기억', () {
    fakeTest(
      'TC-REC-024 REQ-REC-028 삭제 이벤트를 받으면 즉시 칸이 비고 선택이 같은 달 가장 최근 사진으로 옮겨 간다',
      (async) {
        final r = RecordRig();
        r.enter(async);
        expect(r.state.selectedDate, const KstDate(2026, 10, 31));
        r.postEvents.remove(postOct31);
        expect(r.state.photoOn(const KstDate(2026, 10, 31)), isNull);
        expect(r.state.selectedDate, const KstDate(2026, 10, 27));
        expect(
          r.state.availableMonths,
          contains(_oct),
          reason: '달을 임의로 지우지 않는다',
        );
      },
    );

    fakeTest('TC-REC-024 서버의 늦은 재검증 응답이 삭제한 postId를 포함해도 다시 나타나지 않는다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__2026-10.json'),
        fx(
          'record/posts-calendar__2026-10.json',
          delay: const Duration(seconds: 2),
        ),
      ]);
      r.enter(async);
      r.vm.enter(); // 재검증 시작(응답은 아직 삭제 전 데이터)
      r.pass(async, const Duration(seconds: 1));
      r.postEvents.remove(postOct31);
      r.pass(async, const Duration(seconds: 3));
      expect(photoIds(r.state), ['90', '01']);
      expect(r.state.photoOn(const KstDate(2026, 10, 31)), isNull);
    });

    fakeTest('TC-REC-024 다른 달을 보는 중 삭제해도 캐시된 달에 돌아오면 보이지 않는다', (async) {
      final r = RecordRig();
      r.enter(async);
      r.vm.goToPreviousMonth();
      r.pass(async);
      r.postEvents.remove(postOct31);
      r.vm.goToNextMonth();
      expect(photoIds(r.state), ['90', '01'], reason: '캐시를 보여 주는 즉시 걸러짐');
      r.pass(async);
      expect(photoIds(r.state), ['90', '01'], reason: '서버 응답이 포함해도 걸러짐');
    });

    fakeTest('TC-REC-024 현재 달의 마지막 게시물을 지워도 현재 달은 선택지에 남고 선택은 없다', (async) {
      final r = RecordRig();
      r.api.months([fx('record/posts-calendar-months__empty.json')]);
      r.enter(async);
      for (final id in [postOct20, postOct27Pending, postOct31]) {
        r.postEvents.remove(id);
      }
      expect((r.state.content as RecordReady).photos, isEmpty);
      expect(r.state.selectedDate, isNull);
      expect(r.state.availableMonths, [_oct]);
    });
  });

  group('홈에서 날짜를 지정해 진입', () {
    fakeTest('TC-REC-025 이전 달 날짜를 지정하면 그 달과 날짜가 최신 사진보다 우선 선택되고 재검증에도 유지된다', (
      async,
    ) {
      final r = RecordRig();
      r.enter(async, requestedDate: const KstDate(2026, 9, 17));
      expect(r.state.selectedMonth, _sep);
      expect(r.state.selectedDate, const KstDate(2026, 9, 17));
      expect(r.state.selectedDate, isNot(const KstDate(2026, 9, 30)));
      r.vm.onForeground();
      r.pass(async);
      r.vm.enter();
      r.pass(async);
      expect(r.state.selectedMonth, _sep);
      expect(r.state.selectedDate, const KstDate(2026, 9, 17));
    });

    fakeTest('TC-REC-025 본 적 있는 달이면 응답 전에도 캐시에서 그 날짜 사진을 보여 준다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 9, [
        fx('record/posts-calendar__2026-09.json'),
        fx(
          'record/posts-calendar__2026-09.json',
          delay: const Duration(seconds: 3),
        ),
      ]);
      r.enter(async);
      r.vm.goToPreviousMonth();
      r.pass(async);
      r.vm.goToNextMonth();
      r.pass(async);

      r.vm.enter(requestedDate: const KstDate(2026, 9, 17));
      expect(r.state.selectedMonth, _sep);
      expect(r.state.selectedDate, const KstDate(2026, 9, 17));
      expect(r.state.selectedPhoto?.postId, postSep17);
      expect((r.state.content as RecordReady).isRevalidating, isTrue);
      r.pass(async, const Duration(seconds: 5));
      expect(r.state.selectedDate, const KstDate(2026, 9, 17));
    });

    fakeTest('TC-REC-025 같은 달 요청이 로딩 중이면 같은 요청을 다시 보내지 않는다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 9, [
        fx(
          'record/posts-calendar__2026-09.json',
          delay: const Duration(seconds: 3),
        ),
      ]);
      r.vm.enter(requestedDate: const KstDate(2026, 9, 17));
      r.pass(async, const Duration(seconds: 1));
      r.vm.enter(requestedDate: const KstDate(2026, 9, 17));
      r.pass(async, const Duration(seconds: 5));
      expect(r.api.calendarCallsFor(2026, 9), 1);
      expect(r.state.selectedDate, const KstDate(2026, 9, 17));
    });

    fakeTest('TC-REC-026 지정한 날짜의 게시물이 삭제됐으면 다른 날짜의 사진을 대신 열지 않는다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__2026-10-after-delete.json'),
      ]);
      r.enter(async, requestedDate: const KstDate(2026, 10, 27));
      expect(r.state.selectedMonth, _oct);
      expect(r.state.content, isA<RecordReady>());
      expect(r.state.selectedPhoto, isNull);
      expect(r.state.selectedDate, isNull);
    });

    fakeTest('TC-REC-026 첫 조회가 실패한 뒤 다시 시도해도 요청한 날짜를 선택한다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 9, [
        ...failing('record/posts-calendar__500-server-error.json'),
        fx('record/posts-calendar__2026-09.json'),
      ]);
      r.enter(async, requestedDate: const KstDate(2026, 9, 17));
      expect(r.state.content, isA<RecordFailed>());
      r.vm.retry();
      expect(r.state.content, isA<RecordLoading>());
      r.pass(async);
      expect(r.state.content, isA<RecordReady>());
      expect(r.state.selectedDate, const KstDate(2026, 9, 17));
    });
  });

  group('취소·계정·오프라인', () {
    fakeTest('TC-REC-027 화면을 벗어나 첫 조회가 취소되면 오류가 아니라 로딩으로 남고 다시 들어오면 불러온다', (
      async,
    ) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx(
          'record/posts-calendar__2026-10.json',
          delay: const Duration(seconds: 3),
        ),
      ]);
      r.vm.enter();
      r.pass(async, const Duration(seconds: 1));
      r.vm.onHidden();
      r.pass(async, const Duration(seconds: 5));
      expect(r.state.content, isA<RecordLoading>());
      expect(r.toast.messages, isEmpty);

      r.vm.enter();
      r.pass(async, const Duration(seconds: 5));
      expect(r.state.content, isA<RecordReady>());
      expect(photoIds(r.state), ['90', '01', '91']);
    });

    fakeTest('TC-REC-028 계정을 바꾸면 월별 캐시·삭제 기억·선택 날짜가 지워진다', (async) {
      final r = RecordRig();
      r.enter(async);
      r.vm.selectDate(const KstDate(2026, 10, 20));
      r.postEvents.remove(postOct31);
      r.vm.clearAll();
      r.pass(async);
      r.api.calendar(2026, 10, [
        fx(
          'record/posts-calendar__2026-10.json',
          delay: const Duration(seconds: 2),
        ),
      ]);

      r.vm.enter(); // 사용자 B의 첫 진입
      expect(r.state.content, isA<RecordLoading>(), reason: 'A의 캐시가 남지 않는다');
      expect(r.state.selectedDate, isNull);
      r.pass(async, const Duration(seconds: 5));
      expect(photoIds(r.state), [
        '90',
        '01',
        '91',
      ], reason: 'A가 삭제한 id 기억도 지워진다');
      expect(r.state.selectedDate, const KstDate(2026, 10, 31));
    });

    fakeTest('TC-REC-028 A 요청의 늦은 응답은 무시한다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx(
          'record/posts-calendar__2026-10.json',
          delay: const Duration(seconds: 3),
        ),
        fx('record/posts-calendar__2026-10-after-delete.json'),
      ]);
      r.vm.enter(); // 사용자 A: 응답이 3초 뒤
      r.pass(async, const Duration(seconds: 1));
      r.vm.clearAll();
      r.vm.enter(); // 사용자 B
      r.pass(async, const Duration(seconds: 5));
      expect(photoIds(r.state), ['90', '91'], reason: 'B의 응답만 반영');
    });

    fakeTest('TC-REC-029 오프라인 첫 진입은 오류 + 다시 시도이고 온라인 복귀 후 다시 시도하면 불러온다', (
      async,
    ) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        ..._offline(),
        fx('record/posts-calendar__2026-10.json'),
      ]);
      r.enter(async);
      final content = r.state.content;
      expect(content, isA<RecordFailed>());
      expect((content as RecordFailed).failure, RecordFailure.other);
      r.vm.retry();
      r.pass(async);
      expect(r.state.content, isA<RecordReady>());
      expect(photoIds(r.state), ['90', '01', '91']);
    });

    fakeTest('TC-REC-029 캐시가 있을 때 오프라인이면 유지하고 네트워크 토스트를 띄운다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__2026-10.json'),
        ..._offline(),
      ]);
      r.enter(async);
      r.vm.onForeground();
      r.pass(async);
      expect(photoIds(r.state), ['90', '01', '91']);
      expect(r.toast.messages, [Copy.commonErrorNetwork]);
    });
  });
}
