import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/time/kst_clock.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/time/kst_week.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../../banner/domain/banner_list_controller.dart';
import '../../banner/domain/banner_models.dart';
import 'home_models.dart';
import 'home_preload.dart';
import 'home_repository.dart';
import 'home_state.dart';
import 'today_post_repository.dart';

/// 랭킹 사진 좋아요 위임 대상. 낙관적 갱신·롤백·직렬화는 공용 like 기능(전시·피드 PR)이 맡고,
/// 홈은 이 최소 인터페이스에만 의존한다.
abstract interface class RankingLikeToggler {
  void toggle(String postId);
}

/// 홈 탭 ViewModel. 섹션(주제·히어로·이번 주·어제/오늘 랭킹·배너·미읽음)은 서로 기다리지
/// 않고 병렬로 요청하며 한 섹션의 실패가 다른 섹션을 바꾸지 않는다(REQ-HOME-001~002).
///
/// 날짜: 오늘/어제/이번 주는 `clock.now()`의 KST로만 계산한다(REQ-HOME-003).
/// 게스트([isGuest]): `/posts/today`·`/posts/calendar`·AI·미읽음을 부르지 않고 히어로 Empty,
/// 이번 주 7칸 빈 칸, 랭킹·배너·주제만 요청한다(REQ-HOME-012, 018, 026, 047).
///
/// 진입 방식 세 가지:
/// - [load]: 첫 로드. [HomePreloadCache]에 같은 날짜·같은 게스트 여부의 스냅샷이 있으면 그
///   섹션은 요청 없이 채운다.
/// - [refresh]: 당겨서 새로고침. 콘텐츠를 유지한 채 `isRefreshing`만 켜고 전체를 다시 요청,
///   배너는 1페이지부터. 진행 중이면 무시. 실패한 섹션은 기존 값을 유지하고 한 번의
///   새로고침당 토스트 최대 1건(첫 실패 섹션: 네트워크 오류는 Copy.commonErrorNetwork).
/// - [onForeground]/[onBecameVisible]: 인디케이터·토스트 없이 조용히 전체 갱신. 실패해도 유지.
///   현재 KST 날짜가 마지막 로드 날짜와 다르면 새 날짜로 전체를 다시 불러온다
///   (이전 날짜 콘텐츠를 섞지 않는다).
/// 늦게 도착한 이전 세대 응답은 상태를 덮어쓰지 않는다. 취소는 오류로 보이지 않는다.
class HomeViewModel extends ChangeNotifier {
  HomeViewModel({
    required this._home,
    required this._todayPost,
    required this._banners,
    required this._isGuest,
    required this._toast,
    this._preloadCache,
    this._likeToggler,
    this._kstClock = const KstClock(),
  }) {
    _banners.addListener(_publish);
    _today = _kstClock.today();
    _state = _build();
  }

  final HomeRepository _home;
  final TodayPostRepository _todayPost;
  final BannerListController _banners;
  final bool _isGuest;
  final ToastSink _toast;
  final HomePreloadCache? _preloadCache;
  final RankingLikeToggler? _likeToggler;
  final KstClock _kstClock;

  /// 랭킹 섹션에 보이는 사진 수(앞 5장).
  static const _rankingLimit = 5;

  final StreamController<HomeEvent> _events =
      StreamController<HomeEvent>.broadcast();
  final Map<_Section, int> _sequence = {};

  late KstDate _today;
  late HomeState _state;
  CancelToken _token = CancelToken();
  TopicState _topic = const TopicLoading();
  _HeroPhase _heroPhase = _HeroPhase.loading;
  TodayPost? _heroPost;
  WeeklyState _weekly = const WeeklyLoading();
  RankingState _yesterday = const RankingLoading();
  RankingState _popular = const RankingLoading();
  bool _hasUnread = false;
  bool _isRefreshing = false;
  bool _disposed = false;

  HomeState get state => _state;
  Stream<HomeEvent> get events => _events.stream;

  // ---- 진입 ----

  Future<void> load() async {
    if (_disposed) return;
    final today = _kstClock.today();
    final snapshot = _preloadCache?.take(guest: _isGuest, today: today);
    _reset(today);
    await _loadAll(_newRun(_Mode.initial, today), snapshot);
  }

  Future<void> refresh() async {
    if (_disposed || _isRefreshing) return;
    final today = _kstClock.today();
    if (today != _today) {
      // 날짜가 바뀌었으면 이전 날짜 콘텐츠를 섞지 않고 새로 불러온다.
      await _reloadForNewDay(today);
      return;
    }
    _isRefreshing = true;
    _publish();
    final run = _newRun(_Mode.refresh, today);
    await _loadAll(run, null);
    if (_disposed) return;
    _isRefreshing = false;
    _publish();
    final failure = run.firstFailure;
    if (failure != null) _toast.show(_messageOf(failure));
  }

  Future<void> onForeground() => _refreshQuietly();

  Future<void> onBecameVisible() => _refreshQuietly();

  Future<void> refreshUnread() async {
    if (_disposed || _isGuest) return;
    await _loadUnread(_newRunKeepingToken());
  }

  // ---- 섹션 다시 시도 ----

  Future<void> retryHero() async {
    if (_disposed || _isGuest) return;
    _heroPhase = _HeroPhase.loading;
    _publish();
    await _loadHero(_retryRun(), null);
  }

  Future<void> retryTopic() async {
    if (_disposed) return;
    _topic = const TopicLoading();
    _popular = const RankingLoading();
    _publish();
    await _loadTopicAndPopular(_retryRun(), null);
  }

  Future<void> retryWeekly() async {
    if (_disposed) return;
    _weekly = const WeeklyLoading();
    _publish();
    await _loadWeekly(_retryRun());
  }

  Future<void> retryRanking(RankingKind kind) async {
    if (_disposed) return;
    switch (kind) {
      case RankingKind.yesterday:
        _yesterday = const RankingLoading();
        _publish();
        await _loadYesterday(_retryRun());
      case RankingKind.popular:
        final topic = _topic;
        if (topic is! TopicReady) return retryTopic();
        _popular = const RankingLoading();
        _publish();
        final run = _retryRun();
        await _loadPopular(run, topic.topic, _begin(_Section.popular), null);
    }
  }

  Future<void> retryBanners() async {
    if (_disposed) return;
    await _banners.retry();
  }

  void onBannerVisible(int index) {
    if (!_disposed) _banners.onItemVisible(index);
  }

  // ---- 사용자 동작 ----

  void onHeroPressed() {
    if (_disposed) return;
    if (_isGuest) {
      _toast.show(Copy.homeGuestUpload);
      return;
    }
    final hero = _state.hero;
    if (hero is! HeroEmpty) return;
    if (hero.banned) {
      _toast.show(Copy.homeHeroBanned);
    } else {
      _emit(const OpenUploadGate());
    }
  }

  void onNotificationPressed() {
    if (_disposed) return;
    if (_isGuest) {
      _toast.show(Copy.homeGuestNotification);
    } else {
      _emit(const OpenNotifications());
    }
  }

  void onRankingItemPressed(String postId) {
    if (_disposed) return;
    if (_isGuest) {
      _toast.show(Copy.homeGuestFeed);
      return;
    }
    final post = _findPost(postId);
    if (post != null) _emit(OpenFeed(post));
  }

  void onLikePressed(String postId) {
    if (_disposed) return;
    if (_isGuest) {
      _toast.show(Copy.homeGuestLike);
    } else {
      _likeToggler?.toggle(postId);
    }
  }

  void onRankingMorePressed(RankingKind kind) {
    if (_disposed) return;
    final (section, fallback) = switch (kind) {
      RankingKind.yesterday => (_yesterday, _today.addDays(-1)),
      RankingKind.popular => (_popular, _today),
    };
    // 주제가 없어(404) 날짜를 모르는 섹션도 그 섹션이 가리키는 날짜의 전시로 보낸다.
    final date = section is RankingReady ? section.date ?? fallback : fallback;
    _emit(OpenDisplayTab(date: date, popular: true));
  }

  void onWeekDayPressed(KstDate date) {
    if (_disposed) return;
    final weekly = _weekly;
    if (weekly is! WeeklyReady) return;
    final hasPhoto = weekly.days.any(
      (day) => day.date == date && day.entry != null,
    );
    if (hasPhoto) _emit(OpenRecordTab(date: date));
  }

  void onWeekMorePressed() {
    if (!_disposed) _emit(const OpenRecordTab());
  }

  void onBannerPressed(BannerItem item) {
    if (!_disposed) _emit(OpenBanner(item));
  }

  @override
  void dispose() {
    _disposed = true;
    _token.cancel();
    _banners.removeListener(_publish);
    _banners.cancelPending();
    unawaited(_events.close());
    super.dispose();
  }

  // ---- 로드 조립 ----

  /// 날짜가 바뀌었거나 [load]를 다시 부를 때: 모든 섹션을 로딩으로 되돌린다.
  void _reset(KstDate today) {
    _today = today;
    _topic = const TopicLoading();
    _heroPhase = _HeroPhase.loading;
    _heroPost = null;
    _weekly = const WeeklyLoading();
    _yesterday = const RankingLoading();
    _popular = const RankingLoading();
    _isRefreshing = false;
    _publish();
  }

  Future<void> _refreshQuietly() async {
    if (_disposed) return;
    final today = _kstClock.today();
    if (today != _today) return _reloadForNewDay(today);
    await _loadAll(_newRun(_Mode.quiet, today), null);
  }

  Future<void> _reloadForNewDay(KstDate today) {
    _reset(today);
    return _loadAll(_newRun(_Mode.quiet, today), null);
  }

  /// 섹션들을 서로 기다리지 않고 한꺼번에 시작한다(REQ-HOME-001).
  Future<void> _loadAll(_Run run, HomeSnapshot? snapshot) async {
    await Future.wait([
      _loadTopicAndPopular(run, snapshot),
      _loadYesterday(run),
      _loadHero(run, snapshot?.hero),
      _loadWeekly(run),
      _loadUnread(run),
      _loadBanners(run, snapshot?.banners),
    ]);
  }

  /// 이전 요청을 모두 취소하고 새 세트를 연다.
  _Run _newRun(_Mode mode, KstDate today) {
    _token.cancel();
    _token = CancelToken();
    return _Run(_token, today, mode);
  }

  /// 진행 중인 요청을 취소하지 않고 같은 토큰으로 한 섹션만 다시 부른다.
  _Run _newRunKeepingToken() => _Run(_token, _today, _Mode.quiet);

  _Run _retryRun() => _Run(_token, _today, _Mode.initial);

  // ---- 섹션 로더 ----

  Future<void> _loadTopicAndPopular(_Run run, HomeSnapshot? snapshot) async {
    final topicSeq = _begin(_Section.topic);
    final popularSeq = _begin(_Section.popular);
    final Topic? topic;
    try {
      topic =
          snapshot?.topic ??
          await _home.topicOn(run.today, cancelToken: run.token);
    } on Object catch (error) {
      if (!_isLive(_Section.topic, topicSeq)) return;
      final apiError = _asApiError(error);
      if (apiError.isCancelled) return;
      run.fail(apiError);
      // 주제를 못 받으면 오늘 인기도 날짜를 몰라 함께 오류다.
      if (run.replacesOnFailure || _topic is TopicLoading) {
        _topic = const TopicError();
      }
      if (_isLive(_Section.popular, popularSeq) &&
          (run.replacesOnFailure || _popular is RankingLoading)) {
        _popular = const RankingError();
      }
      _publish();
      return;
    }
    if (!_isLive(_Section.topic, topicSeq)) return;
    if (topic == null) {
      _topic = const TopicNotReady();
      if (_isLive(_Section.popular, popularSeq)) {
        _popular = const RankingReady(posts: [], date: null);
      }
      _publish();
      return;
    }
    _topic = TopicReady(topic);
    _publish();
    await _loadPopular(run, topic, popularSeq, snapshot?.popular);
  }

  Future<void> _loadPopular(
    _Run run,
    Topic topic,
    int sequence,
    List<PostSummary>? seed,
  ) async {
    try {
      final posts =
          seed ??
          await _home.popularPosts(topic.topicDate, cancelToken: run.token);
      if (!_isLive(_Section.popular, sequence)) return;
      _popular = RankingReady(posts: _top(posts), date: topic.topicDate);
    } on Object catch (error) {
      if (!_isLive(_Section.popular, sequence)) return;
      final apiError = _asApiError(error);
      if (apiError.isCancelled) return;
      run.fail(apiError);
      if (run.replacesOnFailure || _popular is RankingLoading) {
        _popular = const RankingError();
      }
    }
    _publish();
  }

  Future<void> _loadYesterday(_Run run) async {
    final sequence = _begin(_Section.yesterday);
    try {
      final date = run.today.addDays(-1);
      final topic = await _home.topicOn(date, cancelToken: run.token);
      if (!_isLive(_Section.yesterday, sequence)) return;
      final posts = topic == null
          ? const <PostSummary>[]
          : await _home.popularPosts(topic.topicDate, cancelToken: run.token);
      if (!_isLive(_Section.yesterday, sequence)) return;
      _yesterday = RankingReady(posts: _top(posts), date: topic?.topicDate);
    } on Object catch (error) {
      if (!_isLive(_Section.yesterday, sequence)) return;
      final apiError = _asApiError(error);
      if (apiError.isCancelled) return;
      run.fail(apiError);
      if (run.replacesOnFailure || _yesterday is RankingLoading) {
        _yesterday = const RankingError();
      }
    }
    _publish();
  }

  Future<void> _loadHero(_Run run, TodayPost? seed) async {
    final sequence = _begin(_Section.hero);
    if (_isGuest) {
      _heroPhase = _HeroPhase.guest;
      _heroPost = null;
      _publish();
      return;
    }
    try {
      final post = seed ?? await _todayPost.today(cancelToken: run.token);
      if (!_isLive(_Section.hero, sequence)) return;
      _heroPhase = _HeroPhase.loaded;
      _heroPost = post;
    } on Object catch (error) {
      if (!_isLive(_Section.hero, sequence)) return;
      final apiError = _asApiError(error);
      if (apiError.isCancelled) return;
      switch (apiError.status) {
        // 404/403은 실패가 아니라 히어로의 한 상태다(D-06).
        case 404:
          _heroPhase = _HeroPhase.noOpenTopic;
          _heroPost = null;
        case 403:
          _heroPhase = _HeroPhase.banned;
          _heroPost = null;
        default:
          run.fail(apiError);
          if (run.replacesOnFailure || _heroPhase == _HeroPhase.loading) {
            _heroPhase = _HeroPhase.error;
            _heroPost = null;
          }
      }
    }
    _publish();
  }

  Future<void> _loadWeekly(_Run run) async {
    final sequence = _begin(_Section.weekly);
    final week = KstWeek.containing(run.today);
    if (_isGuest) {
      _weekly = WeeklyReady(
        days: [for (final date in week.days) WeekDay(date: date)],
      );
      _publish();
      return;
    }
    try {
      // 두 달에 걸친 주는 한 달이라도 실패하면 부분 표시 없이 오류다.
      final months = await Future.wait([
        for (final month in week.months)
          _home.calendar(month, cancelToken: run.token),
      ]);
      if (!_isLive(_Section.weekly, sequence)) return;
      final entries = {
        for (final entry in months.expand((entries) => entries))
          entry.topicDate: entry,
      };
      _weekly = WeeklyReady(
        days: [
          for (final date in week.days)
            WeekDay(date: date, entry: entries[date]),
        ],
      );
    } on Object catch (error) {
      if (!_isLive(_Section.weekly, sequence)) return;
      final apiError = _asApiError(error);
      if (apiError.isCancelled) return;
      run.fail(apiError);
      if (run.replacesOnFailure || _weekly is WeeklyLoading) {
        _weekly = const WeeklyError();
      }
    }
    _publish();
  }

  /// 미읽음 점은 실패해도 직전 값을 두고 알리지 않는다(D-10).
  Future<void> _loadUnread(_Run run) async {
    if (_isGuest) return;
    final sequence = _begin(_Section.unread);
    try {
      final hasUnread = await _home.hasUnreadNotifications(
        cancelToken: run.token,
      );
      if (!_isLive(_Section.unread, sequence)) return;
      _hasUnread = hasUnread;
      _publish();
    } on Object {
      // 조용히 무시한다.
    }
  }

  Future<void> _loadBanners(_Run run, BannerPage? seed) async {
    if (run.mode == _Mode.initial) {
      if (seed != null) {
        _banners.seed(seed);
      } else {
        await _banners.loadFirst();
      }
      return;
    }
    final failure = await _banners.refresh();
    if (failure != null && !_disposed && run.token == _token) {
      run.fail(failure);
    }
  }

  // ---- 도우미 ----

  int _begin(_Section section) {
    final next = (_sequence[section] ?? 0) + 1;
    _sequence[section] = next;
    return next;
  }

  bool _isLive(_Section section, int sequence) =>
      !_disposed && _sequence[section] == sequence;

  List<PostSummary> _top(List<PostSummary> posts) =>
      posts.take(_rankingLimit).toList(growable: false);

  PostSummary? _findPost(String postId) {
    for (final section in [_popular, _yesterday]) {
      if (section is! RankingReady) continue;
      for (final post in section.posts) {
        if (post.id == postId) return post;
      }
    }
    return null;
  }

  void _emit(HomeEvent event) {
    if (!_disposed) _events.add(event);
  }

  void _publish() {
    if (_disposed) return;
    _state = _build();
    notifyListeners();
  }

  HomeState _build() => HomeState(
    today: _today,
    topic: _topic,
    hero: _deriveHero(),
    weekly: _weekly,
    yesterday: _yesterday,
    popular: _popular,
    banners: _banners.state,
    hasUnread: _hasUnread,
    isRefreshing: _isRefreshing,
    aiCardPostId: _deriveAiCardPostId(),
  );

  /// 날짜 머리글의 주제 제목. 주제를 받지 못했으면 null.
  String? get _topicTitle {
    final topic = _topic;
    return topic is TopicReady ? topic.topic.title : null;
  }

  HeroState _deriveHero() {
    final post = _heroPost;
    // Empty는 주제 제목을 문구에 넣으므로 주제 응답이 올 때까지 로딩으로 둔다.
    final waitingForTopic = _topic is TopicLoading;
    switch (_heroPhase) {
      case _HeroPhase.loading:
        return const HeroLoading();
      case _HeroPhase.noOpenTopic:
        return const HeroNoOpenTopic();
      case _HeroPhase.error:
        return const HeroError();
      case _HeroPhase.guest:
        return waitingForTopic
            ? const HeroLoading()
            : HeroEmpty(topicTitle: _topicTitle);
      case _HeroPhase.banned:
        return waitingForTopic
            ? const HeroLoading()
            : HeroEmpty(topicTitle: _topicTitle, banned: true);
      case _HeroPhase.loaded:
        if (post == null) return const HeroError();
        if (!post.isPosted) {
          return waitingForTopic
              ? const HeroLoading()
              : HeroEmpty(topicTitle: _topicTitle);
        }
        return switch (post.moderationStatus) {
          ModerationStatus.validating => const HeroProcessing(),
          ModerationStatus.pending || ModerationStatus.approved => HeroPhoto(
            postId: post.postId!,
            thumbnailUrl: _thumbnailOf(post.postId!),
            pending: post.moderationStatus == ModerationStatus.pending,
          ),
          null => const HeroError(),
        };
    }
  }

  /// 히어로 썸네일은 이번 주 기록의 같은 postId 항목에서 가져온다(REQ-HOME-013).
  String? _thumbnailOf(String postId) {
    final weekly = _weekly;
    if (weekly is! WeeklyReady) return null;
    for (final day in weekly.days) {
      final entry = day.entry;
      if (entry != null && entry.postId == postId) {
        return entry.thumbnailImageUrl;
      }
    }
    return null;
  }

  /// 승인된 사진이고 그 주제 날짜가 KST 오늘일 때만 AI 카드 대상이다(REQ-HOME-034).
  String? _deriveAiCardPostId() {
    final post = _heroPost;
    if (_isGuest ||
        _heroPhase != _HeroPhase.loaded ||
        post == null ||
        !post.isPosted ||
        post.moderationStatus != ModerationStatus.approved ||
        post.topicDate != _today) {
      return null;
    }
    return post.postId;
  }

  static ApiError _asApiError(Object error) =>
      error is ApiError ? error : ApiError.invalidResponse(cause: error);

  static String _messageOf(ApiError error) {
    if (error.isNetwork) return Copy.commonErrorNetwork;
    if (error.isConfig) return Copy.commonErrorConfig;
    return Copy.commonErrorGeneric;
  }
}

enum _Section { topic, hero, weekly, yesterday, popular, unread }

enum _HeroPhase { loading, noOpenTopic, banned, error, guest, loaded }

/// 로드를 시작한 방식. 실패를 어떻게 다룰지가 다르다.
enum _Mode {
  /// 첫 로드·섹션 다시 시도: 실패하면 그 섹션을 오류 상태로 바꾼다.
  initial,

  /// 당겨서 새로고침: 실패한 섹션은 기존 내용을 두고 토스트로 알린다.
  refresh,

  /// 복귀·재표시 갱신: 실패해도 기존 내용을 두고 알리지 않는다.
  quiet,
}

/// 한 번의 요청 세트가 공유하는 취소 토큰, 기준 날짜, 첫 실패.
class _Run {
  _Run(this.token, this.today, this.mode);

  final CancelToken token;
  final KstDate today;
  final _Mode mode;
  ApiError? firstFailure;

  /// 실패가 화면의 섹션 상태를 오류로 바꾸는지(첫 로드·다시 시도).
  bool get replacesOnFailure => mode == _Mode.initial;

  /// 새로고침일 때만 토스트로 알릴 첫 실패를 기억한다.
  void fail(ApiError error) {
    if (mode == _Mode.refresh) firstFailure ??= error;
  }
}
