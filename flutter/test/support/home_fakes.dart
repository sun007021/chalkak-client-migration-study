import 'dart:async';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/post_events/post_event_bus.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/core/ui/test_id.dart';
import 'package:chalkak/core/ui/toast/toast_controller.dart';
import 'package:chalkak/features/banner/data/api_banner_repository.dart';
import 'package:chalkak/features/banner/domain/banner_link_launcher.dart';
import 'package:chalkak/features/banner/domain/banner_list_controller.dart';
import 'package:chalkak/features/banner/domain/banner_models.dart';
import 'package:chalkak/features/banner/presentation/banner_test_ids.dart';
import 'package:chalkak/features/banner/presentation/banner_web_view_builder.dart';
import 'package:chalkak/features/feed/domain/feed_target.dart';
import 'package:chalkak/features/home/data/api_home_repository.dart';
import 'package:chalkak/features/home/domain/home_models.dart';
import 'package:chalkak/features/home/domain/home_preload.dart';
import 'package:chalkak/features/home/domain/home_state.dart';
import 'package:chalkak/features/home/domain/home_view_model.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:chalkak/features/like/domain/like_store.dart';
import 'package:chalkak/features/navigation/domain/guest_flag.dart';
import 'package:chalkak/features/navigation/domain/guest_guard.dart';
import 'package:chalkak/features/navigation/domain/main_shell_view_model.dart';
import 'package:chalkak/features/navigation/domain/upload_entry_gate.dart';
import 'package:chalkak/features/navigation/main_dependencies.dart';
import 'package:chalkak/features/navigation/presentation/main_shell_navigator.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart' show test;

import 'auth_fakes.dart';
import 'display_fakes.dart';
import 'fake_adapter.dart';
import 'fake_analytics_tracker.dart';
import 'net_harness.dart' show advance, sessionAt, sessionGuest, settle, t0, v1;

/// `shared/fixtures/<name>`을 manifest의 상태와 함께 응답으로 만든다(지연 선택).
FakeResponse fx(String name, {Duration delay = Duration.zero}) =>
    FakeResponse.fixture(name, delay: delay);

/// GET은 5xx에서 최초 1회 + 재시도 2회(D-21)로 응답을 3개 소비한다. 한 번의 호출이 끝내 실패하는
/// 응답 열을 만든다. 뒤에 성공 응답을 이으면 "실패 뒤 다시 시도로 성공"을 스크립트할 수 있다.
List<FakeResponse> failing(String name) =>
    List.filled(3, fx(name), growable: true);

class _Seq {
  _Seq(this.responses);
  final List<FakeResponse> responses;
  int calls = 0;

  FakeResponse next() {
    final i = calls++;
    return responses[i < responses.length ? i : responses.length - 1];
  }
}

/// 홈 관련 엔드포인트를 [FakeAdapter]에 스크립트한다. 키(날짜·페이지)마다 응답 열을 걸고
/// 마지막 응답이 반복된다. 스크립트 안 한 키는 404/빈 응답으로 답한다.
class HomeApi {
  HomeApi(this.adapter) {
    adapter.onDynamic(
      'GET',
      '$v1/topics',
      (r) => _answer(
        _topics,
        r.uri.queryParameters['date'],
        fx('home/topics__404-not-found.json'),
      ),
    );
    adapter.onDynamic(
      'GET',
      '$v1/posts',
      (r) => _answer(
        _popular,
        r.uri.queryParameters['topicDate'],
        fx('display/posts-list__404-topic-not-found.json'),
      ),
    );
    adapter.onDynamic('GET', '$v1/posts/calendar', (r) {
      final q = r.uri.queryParameters;
      final key = '${q['year']}-${q['month']}';
      return _answer(
        _calendar,
        key,
        FakeResponse.json(200, {
          'year': int.parse(q['year']!),
          'month': int.parse(q['month']!),
          'posts': <Object>[],
        }),
      );
    });
    adapter.onDynamic(
      'GET',
      '$v1/posts/today',
      (r) => (_today ?? _Seq([fx('home/posts-today__404-no-open-topic.json')]))
          .next(),
    );
    adapter.onDynamic(
      'GET',
      '$v1/notifications/unread-status',
      (r) =>
          (_unread ??
                  _Seq([fx('home/notifications-unread-status__false.json')]))
              .next(),
    );
    adapter.onDynamic(
      'GET',
      '$v1/banners',
      (r) => _answer(
        _banners,
        r.uri.queryParameters['page'],
        fx('banner/banners__empty.json'),
      ),
    );
  }

  final FakeAdapter adapter;
  final Map<String, _Seq> _topics = {};
  final Map<String, _Seq> _popular = {};
  final Map<String, _Seq> _calendar = {};
  final Map<String, _Seq> _banners = {};
  _Seq? _today;
  _Seq? _unread;

  static FakeResponse _answer(
    Map<String, _Seq> map,
    String? key,
    FakeResponse fallback,
  ) => (map[key] ?? _Seq([fallback])).next();

  void topic(String date, List<FakeResponse> responses) =>
      _topics[date] = _Seq(responses);
  void popular(String topicDate, List<FakeResponse> responses) =>
      _popular[topicDate] = _Seq(responses);
  void calendar(int year, int month, List<FakeResponse> responses) =>
      _calendar['$year-$month'] = _Seq(responses);
  void banners(int page, List<FakeResponse> responses) =>
      _banners['$page'] = _Seq(responses);
  void today(List<FakeResponse> responses) => _today = _Seq(responses);
  void unread(List<FakeResponse> responses) => _unread = _Seq(responses);

  /// `POST /auth/refresh` 성공 응답(401 갱신 테스트용).
  void refreshSucceeds() => adapter.on('POST', '$v1/auth/refresh', [
    fx('auth/refresh__success.json'),
  ]);

  /// FIXTURE_NOW(KST 2026-10-27 화) 기준 정상 시나리오: 오늘 주제 + 인기 8장, 어제 주제 +
  /// 3장, 10월 캘린더(25·26·27일), 승인된 내 오늘 사진, 미읽음 없음, 배너 1·2페이지.
  void standard({Duration delay = Duration.zero}) {
    topic('2026-10-27', [
      fx('home/topics__open-2026-10-27.json', delay: delay),
    ]);
    topic('2026-10-26', [
      fx('home/topics__open-2026-10-26.json', delay: delay),
    ]);
    popular('2026-10-27', [
      fx('home/posts-list__popular-8.json', delay: delay),
    ]);
    popular('2026-10-26', [
      fx('home/posts-list__popular-3.json', delay: delay),
    ]);
    calendar(2026, 10, [
      fx('home/posts-calendar__2026-10-week-approved.json', delay: delay),
    ]);
    today([fx('home/posts-today__posted-approved.json', delay: delay)]);
    unread([fx('home/notifications-unread-status__false.json', delay: delay)]);
    banners(1, [fx('banner/banners__page1-10.json', delay: delay)]);
    banners(2, [fx('banner/banners__page2-last.json', delay: delay)]);
  }

  /// 어제 인기 목록 첫 사진 id(`posts-list__popular-3`의 첫 항목). 화면 테스트의 항목 id 확인용.
  String popularPostIdForTest(String topicDate) => topicDate == '2026-10-26'
      ? '22222222-2222-4222-8222-222222222261'
      : '22222222-2222-4222-8222-222222222202';

  // 호출 집계
  int get topicCalls => adapter.count('GET', '$v1/topics');
  int get postsCalls => adapter.count('GET', '$v1/posts');
  int get calendarCalls => adapter.count('GET', '$v1/posts/calendar');
  int get todayCalls => adapter.count('GET', '$v1/posts/today');
  int get unreadCalls =>
      adapter.count('GET', '$v1/notifications/unread-status');
  int get bannerCalls => adapter.count('GET', '$v1/banners');
  int get aiReviewCalls => adapter.requests
      .where((r) => r.method == 'GET' && r.path.endsWith('/ai-review'))
      .length;
  int get postDetailCalls => adapter.requests
      .where(
        (r) =>
            r.method == 'GET' &&
            RegExp(r'^/api/v1/posts/[0-9a-f-]{36}$').hasMatch(r.path),
      )
      .length;

  /// 홈 데이터와 무관하게 나간 요청 전체 수(게스트 제한 "API 0건" 확인용).
  int get totalCalls => adapter.requests.length;

  /// 인증이 필요한 호출(`/posts/today`, 캘린더, AI, 미읽음)이 나갔는지.
  int get authenticatedCalls =>
      todayCalls + calendarCalls + aiReviewCalls + unreadCalls;

  List<String> get topicDatesRequested => [
    for (final r in adapter.where('GET', '$v1/topics'))
      r.uri.queryParameters['date']!,
  ];
  List<String> get popularTopicDatesRequested => [
    for (final r in adapter.where('GET', '$v1/posts'))
      r.uri.queryParameters['topicDate']!,
  ];
  List<String> get calendarMonthsRequested => [
    for (final r in adapter.where('GET', '$v1/posts/calendar'))
      '${r.uri.queryParameters['year']}-${r.uri.queryParameters['month']}',
  ];
  List<String> get bannerPagesRequested => [
    for (final r in adapter.where('GET', '$v1/banners'))
      r.uri.queryParameters['page']!,
  ];
}

/// 호출된 토스트 문구를 모으는 Fake.
class RecordingToast implements ToastSink {
  final List<String> messages = [];

  @override
  void show(String message) => messages.add(message);

  String? get last => messages.isEmpty ? null : messages.last;
}

/// 좋아요 위임 Fake.
class FakeLikeToggler implements RankingLikeToggler {
  final List<String> toggled = [];

  @override
  void toggle(String postId) => toggled.add(postId);
}

/// 외부 브라우저 Fake.
class FakeBannerLinkLauncher implements BannerLinkLauncher {
  final List<Uri> opened = [];
  BannerLaunchResult result = BannerLaunchResult.opened;

  @override
  Future<BannerLaunchResult> open(Uri url) async {
    opened.add(url);
    return result;
  }
}

/// 웹뷰 대신 `issue.web-content` 자리만 그리고 host를 저장하는 Fake 빌더.
class FakeBannerWebViewBuilder implements BannerWebViewBuilder {
  BannerWebViewHost? host;
  int builds = 0;

  @override
  Widget build(BuildContext context, BannerWebViewHost host) {
    this.host = host;
    builds++;
    return const TestId(
      BannerTestIds.issueWebContent,
      child: SizedBox.expand(),
    );
  }
}

/// 이동 요청을 기록하는 [MainShellNavigator]. [hold]를 켜면 화면이 "열린 채" 있다가
/// [completeAll]로 닫힌다(연타 무시 확인용).
class FakeMainNavigator implements MainShellNavigator {
  final List<String> calls = [];
  final List<PostSummary> feedSeeds = [];
  final List<KstDate> uploadDates = [];
  final List<BannerItem> banners = [];
  int loginCalls = 0;
  bool hold = false;
  final List<Completer<void>> _open = [];

  Future<void> _record(String name) {
    calls.add(name);
    if (!hold) return Future<void>.value();
    final c = Completer<void>();
    _open.add(c);
    return c.future;
  }

  int count(String name) => calls.where((c) => c == name).length;

  void completeAll() {
    for (final c in _open) {
      c.complete();
    }
    _open.clear();
  }

  @override
  Future<void> openNotifications() => _record('notifications');

  @override
  Future<void> openFeed(PostSummary seed) {
    feedSeeds.add(seed);
    return _record('feed');
  }

  final List<FeedTarget> feedTargets = [];

  @override
  Future<void> openFeedTarget(FeedTarget target) {
    feedTargets.add(target);
    return _record('feed');
  }

  @override
  Future<void> openUpload(KstDate topicDate) {
    uploadDates.add(topicDate);
    return _record('upload');
  }

  @override
  Future<void> openBanner(BannerItem item) {
    banners.add(item);
    return _record('banner');
  }

  @override
  void goToLogin() => loginCalls++;
}

/// 홈 영역 Fake 묶음: 실제 Api*Repository를 [AuthHttpHarness]의 FakeAdapter 위에 얹는다.
class HomeFakes {
  HomeFakes(this.http) : api = HomeApi(http.adapter) {
    home = ApiHomeRepository(client: http.client);
    banners = ApiBannerRepository(client: http.client);
  }

  final AuthHttpHarness http;
  final HomeApi api;
  late final ApiHomeRepository home;
  late final ApiBannerRepository banners;
  final ToastController toast = ToastController();
  final HomePreloadCache preloadCache = HomePreloadCache();
  final FakeBannerLinkLauncher launcher = FakeBannerLinkLauncher();
  final FakeBannerWebViewBuilder webView = FakeBannerWebViewBuilder();
  final PostEventBus postEvents = PostEventBus();
  final GuestFlag guestFlag = GuestFlag();
  final FakeDisplayRepository displayRepository = FakeDisplayRepository();
  final FakePostRepository postRepository = FakePostRepository();
  final FakeLikeRepository likeRepository = FakeLikeRepository();
  late final LikeStore likeStore = LikeStore(
    repository: likeRepository,
    events: postEvents,
    isGuest: () => guestFlag.value,
  );

  MainDependencies get dependencies => MainDependencies(
    homeRepository: home,
    todayPostRepository: home,
    bannerRepository: banners,
    preloadCache: preloadCache,
    toast: toast,
    bannerWebViewBuilder: webView,
    externalLinks: launcher,
    aiCardBuilder: (context, postId) => const TestId(
      HomeTestIds.aiCard,
      child: SizedBox(width: 10, height: 10),
    ),
    displayRepository: displayRepository,
    postRepository: postRepository,
    likeStore: likeStore,
    postEvents: postEvents,
    guestFlag: guestFlag,
  );
}

/// 시작 시각을 정해 가상 시간에서 실행하는 테스트(KST 자정·주 경계 시나리오용).
void fakeTestAt(
  String name,
  DateTime start,
  void Function(FakeAsync async) body,
) {
  test(name, () {
    fakeAsync((async) {
      body(async);
      settle(async);
    }, initialTime: start);
  });
}

/// 홈 ViewModel 테스트 한 벌: 실제 Api*Repository + FakeAdapter 위에 홈, 배너 목록, 셸,
/// 업로드 게이트를 조립한다. [now]는 가상 시계 시작 시각(세션 만료 계산 기준).
/// `api.standard()`가 이미 걸려 있으므로 테스트는 바꿀 응답만 다시 건다.
class HomeRig {
  HomeRig({this.guest = false, DateTime? now, Session? session, this.sink})
    : http = AuthHttpHarness(
        session: guest
            ? sessionGuest()
            : (session ?? sessionAt(now: now ?? t0)),
      ) {
    fakes = HomeFakes(http);
    api.standard();
  }

  final bool guest;

  /// 지정하면 VM들이 [toast] 대신 이 sink(예: 실제 ToastController)를 쓴다.
  final ToastSink? sink;
  final AuthHttpHarness http;
  late final HomeFakes fakes;
  final RecordingToast toast = RecordingToast();
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();
  final HomePreloadCache cache = HomePreloadCache();
  final FakeLikeToggler likes = FakeLikeToggler();
  final List<HomeEvent> homeEvents = [];
  final List<MainShellEvent> shellEvents = [];
  final List<HomeState> homeStates = [];

  HomeApi get api => fakes.api;

  late final BannerListController banners = BannerListController(
    repository: fakes.banners,
  );

  late final HomeViewModel home = _makeHome();

  HomeViewModel _makeHome() {
    final vm = HomeViewModel(
      home: fakes.home,
      todayPost: fakes.home,
      banners: banners,
      isGuest: guest,
      toast: sink ?? toast,
      preloadCache: cache,
      likeToggler: likes,
    );
    vm.events.listen(homeEvents.add);
    vm.addListener(() => homeStates.add(vm.state));
    return vm;
  }

  late final UploadEntryGate gate = UploadEntryGate(todayPost: fakes.home);

  late final MainShellViewModel shell = _makeShell();

  MainShellViewModel _makeShell() {
    final vm = MainShellViewModel(
      guard: GuestGuard(isGuest: guest, toast: sink ?? toast),
      analytics: analytics,
      uploadGate: gate,
      toast: sink ?? toast,
    );
    vm.events.listen(shellEvents.add);
    return vm;
  }

  /// 홈을 처음 불러오고 모든 응답을 소화한다(지연 응답이 없다면 한 번에 끝난다).
  void loadHome(FakeAsync async, {Duration wait = const Duration(seconds: 5)}) {
    home.load();
    advance(async, wait);
  }
}
