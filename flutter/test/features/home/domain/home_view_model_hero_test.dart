import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/home/domain/home_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

const _myPost = '22222222-2222-4222-8222-222222222201';
const _retry = Duration(seconds: 3);

void main() {
  fakeTest('TC-HOME-001 히어로는 /posts/today 응답 전 Loading이고 다른 섹션은 기다리지 않는다', (
    async,
  ) {
    final r = HomeRig();
    r.api.today([
      fx(
        'home/posts-today__posted-approved.json',
        delay: const Duration(seconds: 5),
      ),
    ]);
    r.home.load();
    advance(async, const Duration(seconds: 1));
    final s = r.home.state;
    expect(s.hero, isA<HeroLoading>());
    expect(s.topic, isA<TopicReady>());
    expect(s.weekly, isA<WeeklyReady>());
    expect(s.popular, isA<RankingReady>());
    expect(s.yesterday, isA<RankingReady>());
    advance(async, const Duration(seconds: 4));
    expect(r.home.state.hero, isA<HeroPhoto>());
  });

  fakeTest('TC-HOME-002 /posts/today 404는 NoOpenTopic이다(Error와 구분)', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__404-no-open-topic.json')]);
    r.loadHome(async);
    expect(r.home.state.hero, isA<HeroNoOpenTopic>());
    expect(r.api.todayCalls, 1);
  });

  fakeTest('TC-HOME-003 isPosted=false는 Empty(주제 제목 포함)이고 정지 아님', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__not-posted.json')]);
    r.loadHome(async);
    final hero = r.home.state.hero as HeroEmpty;
    expect(hero.topicTitle, '가을 하늘');
    expect(hero.banned, isFalse);
  });

  fakeTest('TC-HOME-004 VALIDATING은 Processing이고 캘린더에 없어도 유지된다', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__posted-validating.json')]);
    r.api.calendar(2026, 10, [fx('home/posts-calendar__2026-10-empty.json')]);
    r.loadHome(async);
    expect(r.home.state.hero, isA<HeroProcessing>());
  });

  fakeTest(
    'TC-HOME-005 PENDING은 검수 대기 사진이고 썸네일은 캘린더의 같은 postId에서 가져오며 상세 API는 안 부른다',
    (async) {
      final r = HomeRig();
      r.api.today([fx('home/posts-today__posted-pending.json')]);
      r.api.calendar(2026, 10, [
        fx('home/posts-calendar__2026-10-week-pending.json'),
      ]);
      r.loadHome(async);
      final hero = r.home.state.hero as HeroPhoto;
      expect(hero.pending, isTrue);
      expect(hero.postId, _myPost);
      expect(
        hero.thumbnailUrl,
        'https://cdn.example.test/posts/$_myPost/thumbnail.webp',
      );
      expect(r.api.postDetailCalls, 0);
    },
  );

  fakeTest('TC-HOME-006 APPROVED는 배지 없는 사진이다', (async) {
    final r = HomeRig();
    r.loadHome(async);
    final hero = r.home.state.hero as HeroPhoto;
    expect(hero.pending, isFalse);
    expect(
      hero.thumbnailUrl,
      'https://cdn.example.test/posts/$_myPost/thumbnail.webp',
    );
    expect(r.api.postDetailCalls, 0);
  });

  fakeTest('TC-HOME-007 캘린더가 실패해도 히어로는 Error가 아니라 대체 이미지(썸네일 null)다', (async) {
    final r = HomeRig();
    r.api.calendar(2026, 10, [
      fx('home/posts-calendar__500-server-error.json'),
    ]);
    r.loadHome(async);
    expect(r.home.state.weekly, isA<WeeklyError>());
    final hero = r.home.state.hero as HeroPhoto;
    expect(hero.thumbnailUrl, isNull);
    expect(hero.pending, isFalse);
  });

  fakeTest('TC-HOME-007 캘린더에 같은 postId가 없으면 대체 이미지다', (async) {
    final r = HomeRig();
    r.api.calendar(2026, 10, [fx('home/posts-calendar__2026-10-empty.json')]);
    r.loadHome(async);
    expect((r.home.state.hero as HeroPhoto).thumbnailUrl, isNull);
  });

  fakeTest(
    'TC-HOME-008 403(정지)은 Empty(banned)이고 히어로를 눌러도 정지 토스트만 뜨며 같은 요청을 다시 보내지 않는다',
    (async) {
      final r = HomeRig();
      r.api.today([fx('home/posts-today__403-banned.json')]);
      r.loadHome(async);
      final hero = r.home.state.hero as HeroEmpty;
      expect(hero.banned, isTrue);
      r.home.onHeroPressed();
      settle(async);
      expect(r.toast.messages, [Copy.homeHeroBanned]);
      expect(r.homeEvents.whereType<OpenUploadGate>(), isEmpty);
      expect(r.api.todayCalls, 1);
    },
  );

  fakeTest('TC-HOME-009 서버 오류는 Error이고 다시 시도로 1회 재요청해 성공하면 해당 상태가 된다', (async) {
    final r = HomeRig();
    r.api.today([
      ...failing('home/posts-today__500-server-error.json'),
      fx('home/posts-today__posted-approved.json'),
    ]);
    r.loadHome(async);
    expect(r.home.state.hero, isA<HeroError>());
    final calls = r.api.todayCalls;
    r.home.retryHero();
    advance(async, _retry);
    expect(r.api.todayCalls, calls + 1);
    expect(r.home.state.hero, isA<HeroPhoto>());
  });

  fakeTest('TC-HOME-009 연결 실패도 Error다', (async) {
    final r = HomeRig();
    r.api.today([const FakeResponse.fault(FakeFault.disconnect)]);
    r.loadHome(async);
    expect(r.home.state.hero, isA<HeroError>());
  });

  fakeTest('TC-HOME-010 반려는 isPosted=false라 Empty이고 업로드 진입이 가능하다', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__not-posted-after-reject.json')]);
    r.loadHome(async);
    expect(r.home.state.hero, isA<HeroEmpty>());
    expect(r.home.state.hero, isNot(isA<HeroError>()));
    r.home.onHeroPressed();
    settle(async);
    expect(r.homeEvents.whereType<OpenUploadGate>(), hasLength(1));
  });

  fakeTest('TC-HOME-011 알 수 없는 moderationStatus는 Error(다시 시도)다', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__unknown-status.json')]);
    r.loadHome(async);
    expect(r.home.state.hero, isA<HeroError>());
  });

  fakeTest('REQ-HOME-017 isPosted=false인데 postId가 있는 응답은 Error다', (async) {
    final r = HomeRig();
    r.api.today([fx('upload/posts-today__invalid-not-posted-with-post.json')]);
    r.loadHome(async);
    expect(r.home.state.hero, isA<HeroError>());
  });

  fakeTest('TC-HOME-014 401이면 refresh 1회 뒤 원 요청을 1회 재전송해 히어로가 정상 표시된다', (
    async,
  ) {
    final r = HomeRig();
    r.api.today([
      fx('home/posts-today__401-unauthorized.json'),
      fx('home/posts-today__posted-approved.json'),
    ]);
    r.api.refreshSucceeds();
    r.loadHome(async);
    expect(r.home.state.hero, isA<HeroPhoto>());
    expect(r.api.todayCalls, 2);
    expect(r.http.adapter.count('POST', '$v1/auth/refresh'), 1);
  });

  fakeTest('TC-HOME-054 AI 카드는 APPROVED이고 오늘 주제일 때만 대상이며 요청은 0건이다', (async) {
    final r = HomeRig();
    r.loadHome(async);
    expect(r.home.state.aiCardPostId, _myPost);
    expect(r.api.aiReviewCalls, 0);

    for (final name in [
      'posted-pending',
      'posted-validating',
      'not-posted',
      '404-no-open-topic',
    ]) {
      final r2 = HomeRig();
      r2.api.today([fx('home/posts-today__$name.json')]);
      r2.loadHome(async);
      expect(r2.home.state.aiCardPostId, isNull, reason: name);
      expect(r2.api.aiReviewCalls, 0, reason: name);
    }
  });

  fakeTest('TC-HOME-054 게스트에는 AI 카드가 없다', (async) {
    final r = HomeRig(guest: true);
    r.loadHome(async);
    expect(r.home.state.aiCardPostId, isNull);
    expect(r.api.aiReviewCalls, 0);
  });

  fakeTest('TC-HOME-054 지난 주제(주제 날짜가 KST 오늘이 아님)의 승인 사진에는 AI 카드가 없다', (async) {
    final r = HomeRig();
    async.elapse(const Duration(hours: 13)); // KST 2026-10-28 01:00
    r.api.today([
      FakeResponse.json(200, {
        'topicDate': '2026-10-27',
        'isPosted': true,
        'postId': _myPost,
        'moderationStatus': 'APPROVED',
      }),
    ]);
    r.loadHome(async);
    expect(r.home.state.aiCardPostId, isNull);
  });
}
