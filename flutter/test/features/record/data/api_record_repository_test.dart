import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/record/domain/record_models.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart';
import '../../../support/record_fakes.dart';

const _oct = KstMonth(2026, 10);

void main() {
  Future<Object?> errorOf(Future<Object?> f) async {
    try {
      await f;
    } on Object catch (e) {
      return e;
    }
    return null;
  }

  ApiError failure(FakeAsync async, Future<Object?> f) {
    final p = start(async, errorOf(f));
    advance(async, const Duration(seconds: 3));
    return p.value! as ApiError;
  }

  fakeTest('TC-REC-001 월 목록과 달력을 GET으로 부르고 인증 헤더를 붙인다', (async) {
    final r = RecordRig();
    final months = resolve(async, r.repository.months());
    final photos = resolve(async, r.repository.calendar(_oct));
    expect(months, [const KstMonth(2026, 10), const KstMonth(2026, 9)]);
    expect(photos, hasLength(3));
    expect(r.api.monthsCalls, 1);
    final req = r.http.adapter.where('GET', '$v1/posts/calendar').single;
    expect(req.uri.queryParameters, {'year': '2026', 'month': '10'});
    expect(req.hasAuthorization, isTrue);
  });

  fakeTest('TC-REC-002 빈 월 목록 응답은 빈 목록이다(오류 아님)', (async) {
    final r = RecordRig();
    r.api.months([fx('record/posts-calendar-months__empty.json')]);
    expect(resolve(async, r.repository.months()), isEmpty);
  });

  fakeTest('TC-REC-008 TC-REC-011 주제 날짜 문자열 그대로 매핑하고 상태를 구분한다', (async) {
    final r = RecordRig();
    final photos = resolve(async, r.repository.calendar(_oct));
    expect(
      [for (final p in photos) p.topicDate.toApiString()],
      ['2026-10-20', '2026-10-27', '2026-10-31'],
    );
    expect(
      [for (final p in photos) p.status],
      [
        RecordPhotoStatus.approved,
        RecordPhotoStatus.pending,
        RecordPhotoStatus.approved,
      ],
    );
    expect(photos.first.postId, postOct20);
    expect(photos.first.thumbnailImageUrl, startsWith('https://'));
  });

  fakeTest('TC-REC-015 응답이 날짜 오름차순이 아니어도 날짜 순으로 돌려준다', (async) {
    final r = RecordRig();
    r.api.calendar(2026, 10, [
      fx('record/posts-calendar__2026-10-shuffled.json'),
    ]);
    final photos = resolve(async, r.repository.calendar(_oct));
    expect([for (final p in photos) p.topicDate.day], [20, 27, 31]);
  });

  fakeTest('TC-REC-004 TC-REC-020 posts가 빈 달은 빈 목록이다(오류 아님)', (async) {
    final r = RecordRig();
    r.api.calendar(2026, 8, [fx('record/posts-calendar__2026-08-empty.json')]);
    expect(
      resolve(async, r.repository.calendar(const KstMonth(2026, 8))),
      isEmpty,
    );
  });

  group('TC-REC-012 TC-REC-013 TC-REC-014 응답 검증', () {
    for (final (fixture, why) in [
      ('record/posts-calendar__month-mismatch.json', '응답 month가 요청과 다름'),
      ('record/posts-calendar__date-out-of-month.json', '날짜가 그 달 밖'),
      ('record/posts-calendar__duplicate-date.json', '같은 날짜 중복'),
      ('record/posts-calendar__empty-thumbnail.json', '썸네일 URL이 빈 문자열'),
      ('record/posts-calendar__unknown-status.json', 'REJECTED·알 수 없는 status'),
    ]) {
      fakeTest('$why -> invalidResponse이고 재시도하지 않는다 ($fixture)', (async) {
        final r = RecordRig();
        r.api.calendar(2026, 10, [fx(fixture)]);
        final e = failure(async, r.repository.calendar(_oct));
        expect(e.isInvalidResponse, isTrue);
        expect(r.api.calendarCalls, 1);
      });
    }
  });

  group('TC-REC-031 쿼리 범위와 400', () {
    fakeTest('year는 1~9999, month는 1~12 값만 보낸다', (async) {
      final r = RecordRig();
      for (final month in [
        const KstMonth(1, 1),
        const KstMonth(9999, 12),
        const KstMonth(2026, 2),
      ]) {
        resolve(async, r.repository.calendar(month));
      }
      for (final q
          in r.http.adapter
              .where('GET', '$v1/posts/calendar')
              .map((x) => x.uri.queryParameters)) {
        final year = int.parse(q['year']!);
        final month = int.parse(q['month']!);
        expect(year, inInclusiveRange(1, 9999));
        expect(month, inInclusiveRange(1, 12));
      }
    });

    fakeTest('서버 400은 재시도 없이 status 400 오류다', (async) {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__400-invalid-month.json'),
      ]);
      final e = failure(async, r.repository.calendar(_oct));
      expect(e.status, 400);
      expect(r.api.calendarCalls, 1);
    });
  });

  fakeTest('TC-REC-030 401이면 refresh 1회 뒤 원 요청을 1회 재전송해 성공한다', (async) {
    final r = RecordRig();
    r.api.calendar(2026, 10, [
      fx('record/posts-calendar__401-unauthorized.json'),
      fx('record/posts-calendar__2026-10.json'),
    ]);
    r.http.adapter.on('POST', '$v1/auth/refresh', [
      fx('auth/refresh__success.json'),
    ]);
    final photos = resolve(async, r.repository.calendar(_oct));
    expect(photos, hasLength(3));
    expect(r.api.calendarCalls, 2);
    expect(r.http.adapter.count('POST', '$v1/auth/refresh'), 1);
  });

  fakeTest('TC-REC-030 refresh가 REAUTHENTICATION_REQUIRED면 재인증 오류를 던진다', (
    async,
  ) {
    final r = RecordRig();
    r.api.calendar(2026, 10, [
      fx('record/posts-calendar__401-unauthorized.json'),
    ]);
    r.http.adapter.on('POST', '$v1/auth/refresh', [
      fx('auth/refresh__reauthentication-required.json'),
    ]);
    final e = failure(async, r.repository.calendar(_oct));
    expect(e.status, 401);
    expect(r.api.calendarCalls, 1);
  });

  fakeTest('TC-REC-032 서버 500은 GET 재시도 2회 뒤 server 오류다', (async) {
    final r = RecordRig();
    r.api.calendar(
      2026,
      10,
      failing('record/posts-calendar__500-server-error.json'),
    );
    final e = failure(async, r.repository.calendar(_oct));
    expect(e.status, 500);
    expect(r.api.calendarCalls, 3);
  });
}
