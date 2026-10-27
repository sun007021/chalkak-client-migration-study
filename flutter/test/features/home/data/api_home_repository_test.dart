import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/home/domain/home_models.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

void main() {
  final d27 = const KstDate(2026, 10, 27);

  Future<Object?> errorOf(Future<Object?> f) async {
    try {
      await f;
    } on Object catch (e) {
      return e;
    }
    return null;
  }

  Object? failure(FakeAsync async, Future<Object?> f) {
    final p = start(async, errorOf(f));
    advance(async, const Duration(seconds: 3));
    return p.value;
  }

  fakeTest('TC-HOME-015 topicOn은 GET /topics?date=를 보내 주제를 매핑한다', (async) {
    final r = HomeRig();
    final topic = resolve(async, r.fakes.home.topicOn(d27))!;
    expect(
      r.http.adapter.where('GET', '$v1/topics').single.uri.queryParameters,
      {'date': '2026-10-27'},
    );
    expect(topic.id, '11111111-1111-4111-8111-111111111127');
    expect(topic.title, '가을 하늘');
    expect(topic.topicDate, d27);
    expect(topic.phase, 'OPEN');
  });

  fakeTest('TC-HOME-017 TC-HOME-018 주제 404는 null(오류 아님)이고 재시도하지 않는다', (async) {
    final r = HomeRig();
    r.api.topic('2026-10-27', [fx('home/topics__404-not-found.json')]);
    expect(resolve(async, r.fakes.home.topicOn(d27)), isNull);
    expect(r.api.topicCalls, 1);
  });

  fakeTest('REQ-HOME 응답 topicDate가 요청 날짜와 다르면 invalidResponse', (async) {
    final r = HomeRig();
    r.api.topic('2026-10-27', [fx('home/topics__open-2026-10-26.json')]);
    final e = failure(async, r.fakes.home.topicOn(d27)) as ApiError;
    expect(e.isInvalidResponse, isTrue);
  });

  fakeTest('REQ-HOME 주제 400(미래 날짜)은 재시도 없이 오류다', (async) {
    final r = HomeRig();
    r.api.topic('2026-10-27', [fx('time/topics__future-400.json')]);
    final e = failure(async, r.fakes.home.topicOn(d27)) as ApiError;
    expect(e.status, 400);
    expect(r.api.topicCalls, 1);
  });

  fakeTest(
    'TC-HOME-015 popularPosts는 sort=popular&page=1&pageSize=20을 보내고 서버 순서 전부를 돌려준다',
    (async) {
      final r = HomeRig();
      final posts = resolve(async, r.fakes.home.popularPosts(d27));
      final q = r.http.adapter
          .where('GET', '$v1/posts')
          .single
          .uri
          .queryParameters;
      expect(q, {
        'topicDate': '2026-10-27',
        'sort': 'popular',
        'page': '1',
        'pageSize': '20',
      });
      expect(posts, hasLength(8));
      expect(posts.first.id, '22222222-2222-4222-8222-222222222202');
      expect(posts.last.id, '22222222-2222-4222-8222-222222222201');
      expect(posts.first.thumbnailImageUrl, contains('thumbnail.webp'));
      expect(posts.first.originalImageUrl, contains('original.webp'));
    },
  );

  fakeTest('REQ-HOME-029 게시물 목록 404는 빈 목록이다', (async) {
    final r = HomeRig();
    expect(
      resolve(async, r.fakes.home.popularPosts(const KstDate(2026, 10, 1))),
      isEmpty,
    );
  });

  fakeTest('TC-HOME-030 calendar는 year/month 쿼리로 부르고 PENDING·APPROVED를 매핑한다', (
    async,
  ) {
    final r = HomeRig();
    r.api.calendar(2026, 10, [
      fx('home/posts-calendar__2026-10-week-pending.json'),
    ]);
    final entries = resolve(
      async,
      r.fakes.home.calendar(const KstMonth(2026, 10)),
    );
    expect(
      r.http.adapter
          .where('GET', '$v1/posts/calendar')
          .single
          .uri
          .queryParameters,
      {'year': '2026', 'month': '10'},
    );
    expect(entries, hasLength(2));
    expect(entries[0].status, CalendarStatus.approved);
    expect(entries[1].status, CalendarStatus.pending);
    expect(entries[1].topicDate, d27);
    expect(entries[1].postId, '22222222-2222-4222-8222-222222222201');
  });

  fakeTest('TC-HOME-003 not-posted 응답은 postId·moderationStatus가 null이어도 파싱된다', (
    async,
  ) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__not-posted.json')]);
    final today = resolve(async, r.fakes.home.today());
    expect(today.isPosted, isFalse);
    expect(today.postId, isNull);
    expect(today.moderationStatus, isNull);
    expect(today.topicDate, d27);
  });

  fakeTest('TC-HOME-004 TC-HOME-005 TC-HOME-006 moderationStatus를 매핑한다', (
    async,
  ) {
    final r = HomeRig();
    for (final (name, status) in [
      ('validating', ModerationStatus.validating),
      ('pending', ModerationStatus.pending),
      ('approved', ModerationStatus.approved),
    ]) {
      r.api.today([fx('home/posts-today__posted-$name.json')]);
      final today = resolve(async, r.fakes.home.today());
      expect(today.isPosted, isTrue);
      expect(today.moderationStatus, status);
      expect(today.postId, '22222222-2222-4222-8222-222222222201');
    }
  });

  fakeTest('TC-HOME-011 알 수 없는 moderationStatus는 invalidResponse다', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__unknown-status.json')]);
    final e = failure(async, r.fakes.home.today()) as ApiError;
    expect(e.isInvalidResponse, isTrue);
  });

  fakeTest('REQ-HOME-017 isPosted=false인데 postId가 있으면 invalidResponse다', (
    async,
  ) {
    final r = HomeRig();
    r.api.today([fx('upload/posts-today__invalid-not-posted-with-post.json')]);
    final e = failure(async, r.fakes.home.today()) as ApiError;
    expect(e.isInvalidResponse, isTrue);
  });

  fakeTest(
    'TC-HOME-002 TC-HOME-008 /posts/today 404와 403은 상태 코드를 가진 ApiError다',
    (async) {
      final r = HomeRig();
      r.api.today([fx('home/posts-today__404-no-open-topic.json')]);
      expect((failure(async, r.fakes.home.today()) as ApiError).status, 404);
      r.api.today([fx('home/posts-today__403-banned.json')]);
      final e = failure(async, r.fakes.home.today()) as ApiError;
      expect(e.status, 403);
      expect(e.errorCode, ApiErrorCode.forbidden);
    },
  );

  fakeTest('TC-HOME-050 hasUnreadNotifications는 hasUnread 값을 돌려준다', (async) {
    final r = HomeRig();
    r.api.unread([fx('home/notifications-unread-status__true.json')]);
    expect(resolve(async, r.fakes.home.hasUnreadNotifications()), isTrue);
    r.api.unread([fx('home/notifications-unread-status__false.json')]);
    expect(resolve(async, r.fakes.home.hasUnreadNotifications()), isFalse);
  });

  fakeTest('TC-HOME-052 미읽음 조회 500은 ApiError로 던진다', (async) {
    final r = HomeRig();
    r.api.unread([
      fx('home/notifications-unread-status__500-server-error.json'),
    ]);
    expect(
      (failure(
        async,
        r.fakes.home.hasUnreadNotifications(),
      ) as ApiError).status,
      500,
    );
  });
}
