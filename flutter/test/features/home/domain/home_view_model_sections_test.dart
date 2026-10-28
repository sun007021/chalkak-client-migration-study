import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/home/domain/home_models.dart';
import 'package:chalkak/features/home/domain/home_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

const _wait = Duration(seconds: 5);

List<WeekDay> _days(HomeRig r) => (r.home.state.weekly as WeeklyReady).days;

List<String> _dates(HomeRig r) => [
  for (final d in _days(r)) d.date.toApiString(),
];

void main() {
  group('주제·랭킹', () {
    fakeTest(
      'TC-HOME-015 오늘 주제 후 topicDate로 인기 사진을 sort=popular로 부르고 서버 순서 앞 5장만 보인다',
      (async) {
        final r = HomeRig();
        r.loadHome(async);
        expect(
          r.api.topicDatesRequested,
          containsAll(['2026-10-27', '2026-10-26']),
        );
        final popularReq = r.http.adapter.requests
            .where(
              (x) =>
                  x.path.endsWith('/posts') &&
                  x.uri.queryParameters['topicDate'] == '2026-10-27',
            )
            .single;
        expect(popularReq.uri.queryParameters['sort'], 'popular');
        expect(popularReq.uri.queryParameters['page'], '1');
        expect(popularReq.uri.queryParameters['pageSize'], '20');
        final popular = r.home.state.popular as RankingReady;
        expect(popular.posts, hasLength(5));
        expect(popular.posts.map((p) => p.id.substring(34)).toList(), [
          '02',
          '03',
          '04',
          '05',
          '06',
        ]);
        expect(popular.date, const KstDate(2026, 10, 27));
      },
    );

    fakeTest('TC-HOME-016 어제 주제로 같은 방식 조회해 있는 만큼(3장) 보인다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      final y = r.home.state.yesterday as RankingReady;
      expect(y.posts, hasLength(3));
      expect(y.date, const KstDate(2026, 10, 26));
      expect(
        r.api.popularTopicDatesRequested,
        containsAll(['2026-10-26', '2026-10-27']),
      );
    });

    fakeTest('TC-HOME-017 어제 주제가 404이면 어제 랭킹만 빈 상태이고 나머지는 정상이다', (async) {
      final r = HomeRig();
      r.api.topic('2026-10-26', [fx('home/topics__404-not-found.json')]);
      r.loadHome(async);
      final y = r.home.state.yesterday as RankingReady;
      expect(y.posts, isEmpty);
      expect(r.home.state.popular, isA<RankingReady>());
      expect((r.home.state.popular as RankingReady).posts, isNotEmpty);
      expect(r.home.state.hero, isA<HeroPhoto>());
    });

    fakeTest('TC-HOME-018 오늘 주제 404는 NotReady + 오늘 인기 빈 ready이며 오류와 구분된다', (
      async,
    ) {
      final r = HomeRig();
      r.api.topic('2026-10-27', [fx('home/topics__404-not-found.json')]);
      r.loadHome(async);
      expect(r.home.state.topic, isA<TopicNotReady>());
      expect(r.home.state.popular, isA<RankingReady>());
      expect((r.home.state.popular as RankingReady).posts, isEmpty);
    });

    fakeTest('TC-HOME-018 오늘 주제 5xx·400은 오류(TopicError)이고 400은 재시도하지 않는다', (
      async,
    ) {
      final r = HomeRig();
      r.api.topic('2026-10-27', [fx('display/topics__500-server-error.json')]);
      r.loadHome(async);
      expect(r.home.state.topic, isA<TopicError>());

      final r2 = HomeRig();
      r2.api.topic('2026-10-27', [fx('time/topics__future-400.json')]);
      r2.loadHome(async);
      expect(r2.home.state.topic, isA<TopicError>());
      expect(
        r2.api.topicDatesRequested.where((d) => d == '2026-10-27'),
        hasLength(1),
      );
    });

    fakeTest('TC-HOME-019 인기 사진이 0장·1장·4장이어도 있는 만큼만 보인다', (async) {
      for (final (name, count) in [
        ('popular-0', 0),
        ('popular-1', 1),
        ('popular-3', 3),
      ]) {
        final r = HomeRig();
        r.api.popular('2026-10-27', [fx('home/posts-list__$name.json')]);
        r.loadHome(async);
        expect(
          (r.home.state.popular as RankingReady).posts,
          hasLength(count),
          reason: name,
        );
      }
    });

    fakeTest('TC-HOME-020 랭킹 API만 실패하면 그 섹션만 오류이고 다른 섹션은 유지된다', (async) {
      final r = HomeRig();
      r.api.popular('2026-10-27', [
        fx('home/posts-list__500-server-error.json'),
      ]);
      r.loadHome(async);
      expect(r.home.state.popular, isA<RankingError>());
      expect(r.home.state.yesterday, isA<RankingReady>());
      expect(r.home.state.hero, isA<HeroPhoto>());
      expect(r.home.state.weekly, isA<WeeklyReady>());
      expect(r.home.state.banners.items, isNotEmpty);
    });

    fakeTest('TC-HOME-020 랭킹 다시 시도는 그 섹션만 다시 부른다', (async) {
      final r = HomeRig();
      r.api.popular('2026-10-27', [
        ...failing('home/posts-list__500-server-error.json'),
        fx('home/posts-list__popular-8.json'),
      ]);
      r.loadHome(async);
      expect(r.home.state.popular, isA<RankingError>());
      final today = r.api.todayCalls;
      final cal = r.api.calendarCalls;
      r.home.retryRanking(RankingKind.popular);
      advance(async, _wait);
      expect(r.home.state.popular, isA<RankingReady>());
      expect(r.api.todayCalls, today);
      expect(r.api.calendarCalls, cal);
    });
  });

  group('이번 주 기록', () {
    fakeTest(
      'TC-HOME-024 2026-10-27(화)의 주는 10/25~10/31 7칸이고 기록 있는 칸만 entry가 있다',
      (async) {
        final r = HomeRig();
        r.loadHome(async);
        expect(_dates(r), [
          '2026-10-25',
          '2026-10-26',
          '2026-10-27',
          '2026-10-28',
          '2026-10-29',
          '2026-10-30',
          '2026-10-31',
        ]);
        expect(_days(r).map((d) => d.entry != null).toList(), [
          true,
          true,
          true,
          false,
          false,
          false,
          false,
        ]);
        expect((r.home.state.weekly as WeeklyReady).recordedCount, 3);
        expect(r.api.calendarMonthsRequested, ['2026-10']);
      },
    );

    fakeTestAt(
      'TC-HOME-025 일요일(11/1)이면 11/1~11/7이다',
      DateTime.utc(2026, 11, 1, 3),
      (async) {
        final r = HomeRig(now: DateTime.utc(2026, 11, 1, 3));
        r.loadHome(async);
        expect(_dates(r).first, '2026-11-01');
        expect(_dates(r).last, '2026-11-07');
      },
    );

    // 시계는 테스트 하나에 하나뿐이라 토요일은 따로 시작한다.
    fakeTestAt(
      'TC-HOME-025 토요일(10/31)이면 10/25~10/31이다',
      DateTime.utc(2026, 10, 31, 3),
      (async) {
        final r = HomeRig(now: DateTime.utc(2026, 10, 31, 3));
        r.loadHome(async);
        expect(_dates(r).first, '2026-10-25');
        expect(_dates(r).last, '2026-10-31');
      },
    );

    fakeTestAt(
      'TC-HOME-026 월 경계(9/30): 9/27~10/3이고 9월·10월 캘린더를 모두 요청해 합친다',
      DateTime.utc(2026, 9, 30, 3),
      (async) {
        final r = HomeRig(now: DateTime.utc(2026, 9, 30, 3));
        r.api.topic('2026-09-30', [fx('home/topics__open-2026-10-27.json')]);
        r.api.calendar(2026, 9, [fx('home/posts-calendar__2026-09-week.json')]);
        r.api.calendar(2026, 10, [
          fx('home/posts-calendar__2026-10-week-approved.json'),
        ]);
        r.loadHome(async);
        expect(_dates(r).first, '2026-09-27');
        expect(_dates(r).last, '2026-10-03');
        expect(r.api.calendarMonthsRequested.toSet(), {'2026-9', '2026-10'});
        final byDate = {
          for (final d in _days(r)) d.date.toApiString(): d.entry,
        };
        expect(byDate['2026-09-29']?.postId, endsWith('99'));
        expect(byDate['2026-09-30']?.postId, endsWith('96'));
      },
    );

    fakeTestAt(
      'TC-HOME-027 연말 경계(12/31): 12/27~1/2이고 2026-12·2027-01을 조회하며 칸 순서가 맞다',
      DateTime.utc(2026, 12, 31, 3),
      (async) {
        final r = HomeRig(now: DateTime.utc(2026, 12, 31, 3));
        r.api.calendar(2026, 12, [
          fx('home/posts-calendar__2026-12-week.json'),
        ]);
        r.api.calendar(2027, 1, [
          fx('home/posts-calendar__2027-01-empty.json'),
        ]);
        r.loadHome(async);
        expect(_dates(r), [
          '2026-12-27',
          '2026-12-28',
          '2026-12-29',
          '2026-12-30',
          '2026-12-31',
          '2027-01-01',
          '2027-01-02',
        ]);
        expect(r.api.calendarMonthsRequested.toSet(), {'2026-12', '2027-1'});
        expect(_days(r)[1].entry?.status, CalendarStatus.approved);
        expect(_days(r)[4].entry?.status, CalendarStatus.pending);
      },
    );

    fakeTestAt(
      'TC-HOME-028 윤년(2028-02-29): 2/27~3/4이고 2028-02·2028-03을 조회한다',
      DateTime.utc(2028, 2, 29, 3),
      (async) {
        final r = HomeRig(now: DateTime.utc(2028, 2, 29, 3));
        r.loadHome(async);
        expect(_dates(r), [
          '2028-02-27',
          '2028-02-28',
          '2028-02-29',
          '2028-03-01',
          '2028-03-02',
          '2028-03-03',
          '2028-03-04',
        ]);
        expect(r.api.calendarMonthsRequested.toSet(), {'2028-2', '2028-3'});
      },
    );

    fakeTestAt(
      'TC-HOME-029 UTC 10/26 15:00은 KST 10/27 화요일이다(UTC 날짜를 쓰지 않는다)',
      DateTime.utc(2026, 10, 26, 15),
      (async) {
        final r = HomeRig(now: DateTime.utc(2026, 10, 26, 15));
        r.loadHome(async);
        expect(r.home.state.today, const KstDate(2026, 10, 27));
        expect(r.api.topicDatesRequested.toSet(), {'2026-10-27', '2026-10-26'});
        expect(_dates(r).first, '2026-10-25');
      },
    );

    fakeTest('TC-HOME-030 PENDING·APPROVED 칸은 entry가 있고 서버가 주지 않은 날은 빈 칸이다', (
      async,
    ) {
      final r = HomeRig();
      r.api.calendar(2026, 10, [
        fx('home/posts-calendar__2026-10-week-pending.json'),
      ]);
      r.loadHome(async);
      expect(_days(r)[1].entry?.status, CalendarStatus.approved);
      expect(_days(r)[2].entry?.status, CalendarStatus.pending);
      expect(_days(r)[0].entry, isNull);
      expect(_days(r)[3].entry, isNull);
    });

    fakeTest('TC-HOME-032 주간 조회가 실패하면 그 섹션만 오류이고 다시 시도로 복구된다', (async) {
      final r = HomeRig();
      r.api.calendar(2026, 10, [
        ...failing('home/posts-calendar__500-server-error.json'),
        fx('home/posts-calendar__2026-10-week-approved.json'),
      ]);
      r.loadHome(async);
      expect(r.home.state.weekly, isA<WeeklyError>());
      expect(r.home.state.hero, isA<HeroPhoto>());
      r.home.retryWeekly();
      advance(async, _wait);
      expect(r.home.state.weekly, isA<WeeklyReady>());
    });

    fakeTestAt(
      'TC-HOME-033 두 달 중 한 달만 실패하면 부분 표시 없이 오류이고 다시 시도는 두 달을 모두 다시 요청한다',
      DateTime.utc(2026, 9, 30, 3),
      (async) {
        final r = HomeRig(now: DateTime.utc(2026, 9, 30, 3));
        r.api.calendar(2026, 9, [fx('home/posts-calendar__2026-09-week.json')]);
        r.api.calendar(2026, 10, [
          ...failing('home/posts-calendar__500-server-error.json'),
          fx('home/posts-calendar__2026-10-week-approved.json'),
        ]);
        r.loadHome(async);
        expect(r.home.state.weekly, isA<WeeklyError>());
        final before = r.api.calendarMonthsRequested.length;
        r.home.retryWeekly();
        advance(async, _wait);
        final again = r.api.calendarMonthsRequested.sublist(before);
        expect(again.toSet(), {'2026-9', '2026-10'});
        expect(r.home.state.weekly, isA<WeeklyReady>());
      },
    );
  });

  fakeTest('TC-HOME-034 요청은 병렬로 시작되고 느린 섹션이 먼저 끝난 섹션을 막지 않는다', (async) {
    final r = HomeRig();
    r.api.standard(delay: const Duration(seconds: 1));
    r.api.today([
      fx(
        'home/posts-today__posted-approved.json',
        delay: const Duration(seconds: 5),
      ),
    ]);
    r.home.load();
    settle(async);
    // 아무 응답도 오기 전에 서로 독립인 요청이 모두 나가 있다.
    expect(r.api.todayCalls, 1);
    expect(r.api.calendarCalls, 1);
    expect(r.api.bannerCalls, 1);
    expect(r.api.unreadCalls, 1);
    expect(r.api.topicCalls, 2);
    advance(async, const Duration(seconds: 3));
    expect(r.home.state.hero, isA<HeroLoading>());
    expect(r.home.state.popular, isA<RankingReady>());
    expect(r.home.state.weekly, isA<WeeklyReady>());
    expect(r.home.state.banners.items, isNotEmpty);
    advance(async, const Duration(seconds: 3));
    expect(r.home.state.hero, isA<HeroPhoto>());
  });

  fakeTest('TC-HOME-045 오프라인 첫 진입: 모든 섹션이 오류이고 온라인 복귀 후 다시 시도하면 모두 로드된다', (
    async,
  ) {
    final r = HomeRig();
    const offline = FakeResponse.fault(FakeFault.disconnect);
    r.api.topic('2026-10-27', [offline]);
    r.api.topic('2026-10-26', [offline]);
    r.api.calendar(2026, 10, [offline]);
    r.api.today([offline]);
    r.api.banners(1, [offline]);
    r.loadHome(async, wait: const Duration(seconds: 10));
    final s = r.home.state;
    expect(s.topic, isA<TopicError>());
    expect(s.hero, isA<HeroError>());
    expect(s.weekly, isA<WeeklyError>());
    expect(s.popular, isA<RankingError>());
    expect(s.yesterday, isA<RankingError>());
    expect(s.banners.status.name, 'error');

    r.api.standard();
    r.home.retryTopic();
    r.home.retryHero();
    r.home.retryWeekly();
    r.home.retryRanking(RankingKind.popular);
    r.home.retryRanking(RankingKind.yesterday);
    r.home.retryBanners();
    advance(async, const Duration(seconds: 10));
    final ok = r.home.state;
    expect(ok.topic, isA<TopicReady>());
    expect(ok.hero, isA<HeroPhoto>());
    expect(ok.weekly, isA<WeeklyReady>());
    expect(ok.popular, isA<RankingReady>());
    expect(ok.yesterday, isA<RankingReady>());
    expect(ok.banners.items, isNotEmpty);
  });
}
