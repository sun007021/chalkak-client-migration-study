import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/banner/domain/banner_models.dart';
import 'package:chalkak/features/home/domain/home_models.dart';
import 'package:chalkak/features/home/domain/home_preload.dart';
import 'package:chalkak/features/home/domain/home_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

const _wait = Duration(seconds: 5);
const _approved = 'home/posts-today__posted-approved.json';

void main() {
  group('새로고침 (D-20)', () {
    fakeTest('TC-HOME-035 새로고침은 콘텐츠를 유지한 채 인디케이터만 켜고 성공하면 교체한다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      r.api.today([
        fx(
          'home/posts-today__posted-pending.json',
          delay: const Duration(seconds: 1),
        ),
      ]);
      r.home.refresh();
      settle(async);
      expect(r.home.state.isRefreshing, isTrue);
      expect(r.home.state.hero, isA<HeroPhoto>(), reason: '콘텐츠 유지');
      advance(async, _wait);
      expect(r.home.state.isRefreshing, isFalse);
      expect((r.home.state.hero as HeroPhoto).pending, isTrue);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('TC-HOME-035 새로고침 실패는 기존 콘텐츠를 유지하고 네트워크 오류면 네트워크 토스트를 1건 띄운다', (
      async,
    ) {
      final r = HomeRig();
      r.loadHome(async);
      r.api.today([const FakeResponse.fault(FakeFault.disconnect)]);
      r.home.refresh();
      advance(async, _wait);
      expect(r.home.state.hero, isA<HeroPhoto>());
      expect(r.home.state.isRefreshing, isFalse);
      expect(r.toast.messages, [Copy.commonErrorNetwork]);
    });

    fakeTest('TC-HOME-035 서버 오류로 실패해도 기존 콘텐츠를 유지하고 토스트는 한 번의 새로고침당 최대 1건이다', (
      async,
    ) {
      final r = HomeRig();
      r.loadHome(async);
      r.api.today([fx('home/posts-today__500-server-error.json')]);
      r.api.popular('2026-10-27', [
        fx('home/posts-list__500-server-error.json'),
      ]);
      r.home.refresh();
      advance(async, _wait);
      expect(r.home.state.hero, isA<HeroPhoto>());
      expect(r.home.state.popular, isA<RankingReady>());
      expect(r.toast.messages, hasLength(1));
    });

    fakeTest('TC-BANR-011 새로고침은 배너를 1페이지부터 다시 받고 실패하면 기존 배너를 유지한다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      r.api.banners(1, [fx('banner/banners__500-server-error.json')]);
      r.home.refresh();
      advance(async, _wait);
      expect(r.home.state.banners.items, hasLength(10));
      expect(r.api.bannerPagesRequested.last, '1');
    });

    fakeTest('TC-HOME-036 새로고침 연타는 요청 세트 1회만 나간다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      final before = r.http.adapter.requests.length;
      r.api.today([fx(_approved, delay: const Duration(seconds: 1))]);
      r.home.refresh();
      r.home.refresh();
      r.home.refresh();
      advance(async, _wait);
      final sent = r.http.adapter.requests.skip(before);
      expect(sent.where((q) => q.path.endsWith('/posts/today')), hasLength(1));
      expect(sent.where((q) => q.path.endsWith('/banners')), hasLength(1));
    });
  });

  group('조용한 갱신 (복귀·재표시)', () {
    fakeTest('TC-HOME-039 포그라운드 복귀는 인디케이터 없이 갱신하고 성공하면 교체한다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      r.homeStates.clear();
      r.api.today([fx('home/posts-today__posted-pending.json')]);
      r.home.onForeground();
      advance(async, _wait);
      expect(r.homeStates.any((s) => s.isRefreshing), isFalse);
      expect((r.home.state.hero as HeroPhoto).pending, isTrue);
    });

    fakeTest('TC-HOME-039 조용한 갱신이 실패하면 기존 콘텐츠를 유지하고 토스트도 없다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      r.api.today([fx('home/posts-today__500-server-error.json')]);
      r.home.onBecameVisible();
      advance(async, _wait);
      expect(r.home.state.hero, isA<HeroPhoto>());
      expect(r.toast.messages, isEmpty);
    });

    fakeTest(
      'TC-HOME-050 TC-HOME-051 홈 표시·포그라운드·알림함 복귀·푸시 수신마다 미읽음을 1회씩 다시 조회한다',
      (async) {
        final r = HomeRig();
        r.loadHome(async);
        expect(r.api.unreadCalls, 1, reason: '홈이 보일 때');
        r.home.onBecameVisible();
        advance(async, _wait);
        expect(r.api.unreadCalls, 2);
        r.home.onForeground();
        advance(async, _wait);
        expect(r.api.unreadCalls, 3);
        r.home.refreshUnread();
        advance(async, _wait);
        expect(r.api.unreadCalls, 4, reason: '알림함에서 돌아옴 / 푸시 수신');
        expect(r.api.todayCalls, 3, reason: 'refreshUnread는 다른 섹션을 다시 부르지 않는다');
      },
    );

    fakeTest('TC-HOME-050 hasUnread에 따라 점 상태가 바뀐다', (async) {
      final r = HomeRig();
      r.api.unread([fx('home/notifications-unread-status__true.json')]);
      r.loadHome(async);
      expect(r.home.state.hasUnread, isTrue);
      r.api.unread([fx('home/notifications-unread-status__false.json')]);
      r.home.refreshUnread();
      advance(async, _wait);
      expect(r.home.state.hasUnread, isFalse);
    });

    fakeTest('TC-HOME-052 미읽음 조회가 실패하면 직전 값을 유지하고 토스트·오류가 없다', (async) {
      final r = HomeRig();
      r.api.unread([
        fx('home/notifications-unread-status__true.json'),
        fx('home/notifications-unread-status__500-server-error.json'),
      ]);
      r.loadHome(async);
      expect(r.home.state.hasUnread, isTrue);
      r.home.refreshUnread();
      advance(async, _wait);
      expect(r.home.state.hasUnread, isTrue);
      expect(r.toast.messages, isEmpty);
    });
  });

  group('취소·세대 보호', () {
    fakeTest('TC-HOME-038 화면을 벗어나(dispose) 취소돼도 오류 토스트·상태 변화가 없다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      r.api.today([fx(_approved, delay: const Duration(seconds: 5))]);
      r.home.refresh();
      settle(async);
      final hero = r.home.state.hero;
      r.home.dispose();
      advance(async, const Duration(seconds: 10));
      expect(r.toast.messages, isEmpty);
      expect(hero, isA<HeroPhoto>());
    });

    fakeTestAt(
      'TC-HOME-037 자정 뒤 새 로드가 먼저 도착하면 늦게 온 이전 날짜 응답이 덮지 않는다',
      DateTime.utc(2026, 10, 27, 14, 59, 50),
      (async) {
        final r = HomeRig(now: DateTime.utc(2026, 10, 27, 14, 59, 50));
        r.loadHome(async);
        // 이전 날짜(10/27)의 느린 히어로 응답
        r.api.today([
          fx(
            'home/posts-today__posted-pending.json',
            delay: const Duration(seconds: 30),
          ),
        ]);
        r.home.onBecameVisible();
        settle(async);
        async.elapse(const Duration(seconds: 15)); // KST 10/28 00:00:05
        r.api.topic('2026-10-28', [fx('home/topics__open-2026-10-28.json')]);
        r.api.today([fx('home/posts-today__not-posted.json')]);
        r.home.onBecameVisible();
        advance(async, const Duration(seconds: 1));
        expect(r.home.state.today, const KstDate(2026, 10, 28));
        advance(async, const Duration(seconds: 30));
        expect(
          r.home.state.hero,
          isA<HeroEmpty>(),
          reason: '이전 응답(PENDING)이 덮지 않는다',
        );
      },
    );
  });

  group('KST 날짜 변경 (REQ-HOME-041)', () {
    fakeTestAt(
      'TC-HOME-040 KST 23:59:59에는 날짜가 그대로 10/27이고 새 날짜 요청이 없다',
      DateTime.utc(2026, 10, 27, 14, 59, 59),
      (async) {
        final r = HomeRig(now: DateTime.utc(2026, 10, 27, 14, 59, 59));
        r.loadHome(async);
        r.home.onBecameVisible();
        advance(async, _wait);
        expect(r.home.state.today, const KstDate(2026, 10, 27));
        expect(r.api.topicDatesRequested.toSet(), {'2026-10-27', '2026-10-26'});
      },
    );

    fakeTestAt(
      'TC-HOME-041 자정(KST 10/28 00:00)을 지나 홈이 다시 보이면 새 날짜 기준으로 전부 다시 불러온다',
      DateTime.utc(2026, 10, 27, 14, 59, 59),
      (async) {
        final r = HomeRig(now: DateTime.utc(2026, 10, 27, 14, 59, 59));
        r.loadHome(async);
        r.api.topic('2026-10-28', [fx('home/topics__open-2026-10-28.json')]);
        r.api.popular('2026-10-28', [fx('home/posts-list__popular-5.json')]);
        r.api.today([fx('home/posts-today__not-posted.json')]);
        async.elapse(const Duration(seconds: 1)); // 15:00:00Z
        r.home.onBecameVisible();
        advance(async, _wait);
        final s = r.home.state;
        expect(s.today, const KstDate(2026, 10, 28));
        expect(r.api.topicDatesRequested, contains('2026-10-28'));
        expect((s.topic as TopicReady).topic.title, '골목길');
        expect((s.yesterday as RankingReady).date, const KstDate(2026, 10, 27));
        expect((s.popular as RankingReady).posts, hasLength(5));
        expect(s.hero, isA<HeroEmpty>(), reason: '이전 날짜 콘텐츠가 섞이지 않는다');
        expect(r.api.todayCalls, 2);
      },
    );

    fakeTestAt(
      'TC-HOME-042 자정 직후 새 주제가 아직 없으면 NoOpenTopic·오늘 인기 빈 ready이고 어제 랭킹은 10/27 기준이다',
      DateTime.utc(2026, 10, 27, 14, 59, 59),
      (async) {
        final r = HomeRig(now: DateTime.utc(2026, 10, 27, 14, 59, 59));
        r.loadHome(async);
        r.api.topic('2026-10-28', [fx('home/topics__404-not-found.json')]);
        r.api.topic('2026-10-27', [fx('home/topics__open-2026-10-27.json')]);
        r.api.today([fx('home/posts-today__404-no-open-topic.json')]);
        async.elapse(const Duration(seconds: 1));
        r.home.onForeground();
        advance(async, _wait);
        final s = r.home.state;
        expect(s.hero, isA<HeroNoOpenTopic>());
        expect(s.topic, isA<TopicNotReady>());
        expect((s.popular as RankingReady).posts, isEmpty);
        expect((s.yesterday as RankingReady).date, const KstDate(2026, 10, 27));
      },
    );

    fakeTestAt(
      'TC-HOME-043 토요일 23:59:59 다음 일요일 00:00을 지나면 이번 주가 11/1~11/7로 바뀌고 11월 캘린더를 조회한다',
      DateTime.utc(2026, 10, 31, 14, 59, 59),
      (async) {
        final r = HomeRig(now: DateTime.utc(2026, 10, 31, 14, 59, 59));
        r.loadHome(async);
        var days = (r.home.state.weekly as WeeklyReady).days;
        expect(days.first.date, const KstDate(2026, 10, 25));
        r.api.calendar(2026, 11, [
          fx('home/posts-calendar__2026-11-empty.json'),
        ]);
        async.elapse(const Duration(seconds: 1));
        r.home.onBecameVisible();
        advance(async, _wait);
        days = (r.home.state.weekly as WeeklyReady).days;
        expect(days.first.date, const KstDate(2026, 11, 1));
        expect(days.last.date, const KstDate(2026, 11, 7));
        expect(r.api.calendarMonthsRequested, contains('2026-11'));
      },
    );
  });

  fakeTest('프리로드 캐시에 같은 날짜·같은 게스트 여부의 스냅샷이 있으면 그 섹션은 요청 없이 채운다', (async) {
    final r = HomeRig();
    r.cache.store(
      const HomeSnapshot(
        today: KstDate(2026, 10, 27),
        guest: false,
        topic: Topic(
          id: '11111111-1111-4111-8111-111111111127',
          title: '가을 하늘',
          topicDate: KstDate(2026, 10, 27),
          phase: 'OPEN',
        ),
        topicFound: true,
        popular: [
          PostSummary(
            id: '22222222-2222-4222-8222-222222222202',
            thumbnailImageUrl: 'https://cdn.example.test/t.webp',
            originalImageUrl: 'https://cdn.example.test/o.webp',
            likeCount: 1,
            isLiked: false,
            isMine: false,
          ),
        ],
        banners: BannerPage(page: 1, hasNext: false, banners: []),
        hero: TodayPost(topicDate: KstDate(2026, 10, 27), isPosted: false),
      ),
    );
    r.loadHome(async);
    expect((r.home.state.topic as TopicReady).topic.title, '가을 하늘');
    expect((r.home.state.popular as RankingReady).posts, hasLength(1));
    expect(r.home.state.hero, isA<HeroEmpty>());
    expect(r.api.todayCalls, 0);
    expect(r.api.bannerCalls, 0);
    expect(r.api.topicDatesRequested, ['2026-10-26'], reason: '어제만 요청');
    expect(r.api.calendarCalls, 1);
  });
}
