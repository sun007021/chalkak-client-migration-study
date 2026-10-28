import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/post_events/post_event_bus.dart';
import '../../../core/time/kst_clock.dart';
import '../../../core/time/kst_date.dart';
import '../../feed/domain/feed_target.dart';
import '../../like/domain/like_store.dart';
import '../../like/domain/toast_message.dart';
import '../domain/display_models.dart';
import '../domain/display_repository.dart';
import '../domain/exhibit.dart';
import 'display_state.dart';

export 'display_state.dart';

/// 전시 탭 상태(REQ-DISP-001~035, REQ-LIKE-004·009·010).
///
/// 날짜 이동·선택
/// - [load]: [initialDate](없으면 KST 오늘)의 전시를 연다. 한 날짜는 `GET /topics?date`로 주제를 확인한 뒤
///   응답 `topicDate`로 `GET /posts`를 부른다. 첫 로딩 중에는 이동 가능 여부가 모두 false.
/// - 날짜 하한 [KstDate.firstTopic], 상한은 KST 오늘. [goPrevious]·[goNext]는 범위 밖이면 요청 없이 무시.
/// - [selectDate]는 범위 밖이면 가장 가까운 끝으로 맞추고, 지금 날짜와 같으면 재요청하지 않는다.
/// - 이동 중에는 이전 전시를 그대로 보여 주고 성공하면 교체. 연타하면 마지막 목적지만 반영하고
///   이전 목적지의 늦은 응답은 화면을 덮지 않는다(그 결과는 (날짜, 정렬) 캐시에만 남는다).
/// - 이동 실패는 직전 성공 전시·날짜로 복원하고 토스트: 주제 404 `Copy.displayDateMissing`,
///   연결 실패 `Copy.commonErrorNetwork`, 그 밖 `Copy.displayError`.
/// - 보이는 전시가 없는 첫 로딩에서: 주제 404 또는 posts 404 또는 0장은 empty,
///   그 밖 실패는 요청한 날짜를 유지한 error.
///
/// 정렬·시드·페이징
/// - 오늘만 정렬 3종(기본 recent). 지난 날짜는 popular 고정이고 오늘로 돌아오면 고른 정렬을 복원한다.
/// - 같은 (날짜, 정렬)의 캐시가 있으면 즉시 보여 주고 첫 페이지를 재검증한다([DisplayState.isRefreshing]).
///   정렬을 바꾸는 중에는 새 결과가 올 때까지 기존 사진을 둔다.
/// - random: 첫 페이지는 시드 없이 요청하고 응답 `randomSeed`를 저장해 2페이지부터 보낸다. 재검증의
///   첫 페이지에도 저장한 시드를 보내고 같은 시드의 뒤쪽 페이지는 유지한다. recent/popular로 바꾸면
///   시드를 버리고 요청에 시드를 싣지 않는다. 시드 없는 random 응답(hasNext=true)은 다음 페이지를
///   요청하지 않는다.
/// - 페이지 크기 20, 페이지 경계의 중복 id는 한 번만. 다음 페이지는 [onVisibleIndexChanged]가
///   마지막에서 세 번째 항목 이내(`index >= items.length - 3`)에 닿을 때, 진행 중이 아니고
///   hasNext이며 첫 페이지 재검증 중이 아닐 때만 한 번 요청한다. 실패하면 목록을 유지하고 토스트,
///   같은 page를 다시 요청한다.
/// - 아카이브: 상위 5장 [DisplayState.featured] + [DisplayState.items]는 전체. 같은 날짜 재검증은
///   featuredPage 유지, 다른 날짜는 0.
/// - 응답이 요청 시점의 (날짜, 정렬)·세대와 다르면 화면에 반영하지 않는다.
///
/// 새로고침: [onTabReselected]는 [DisplayScrollToTop] 이벤트와 함께, [onReturnedFromFeed]는 보던
/// 위치·정렬을 유지한 채 첫 페이지를 재검증한다. 성공하면 교체, 실패하면 기존 전시를 유지하고
/// 토스트만. [onResumed]는 KST 오늘만 다시 계산한다(보던 날짜는 그대로, 요청 없음).
///
/// 좋아요·삭제: 카드의 좋아요 값은 [LikeStore]가 최신이다([onLikeTapped]). 재검증 응답은
/// [LikeStore.reconcile]로 병합해 늦은 응답이 좋아요를 덮지 않는다. [PostEventBus]의
/// [PostRemoved]는 목록·추천·캐시에서 뺀다(이미 삭제된 id가 늦은 응답에 실려 와도 되살리지 않는다).
/// [PostTitleChanged]는 제목을 반영한다.
///
/// 게스트: 전시 조회는 하되 카드의 `isLiked`·`isMine`은 응답 값과 무관하게 false로 다룬다.
/// [onPostTapped]는 `Copy.guestFeed` 토스트만, [onLikeTapped]는 [LikeStore]가 `Copy.guestLike` 토스트만 내고 API는 없다.
/// 좋아요 토스트(실패·게스트)는 [LikeStore.toasts]로 나가며 [DisplayToast]가 아니다.
///
/// [dispose] 뒤에 도착한 응답은 상태·이벤트에 반영하지 않고 오류도 만들지 않는다(진행 중 요청은 취소).
///
/// 계정 전환: [onAccountChanged]가 캐시·시드·진행 중 응답을 모두 버리고 처음 상태(초기 날짜·정렬)로
/// 다시 연다. 좋아요 저장소·삭제 기억([LikeStore.reset], [PostEventBus.reset])은 호출한 쪽이 비운다.
///
/// 랜덤 시드는 한 번의 랜덤 표시 동안만 산다: 다른 날짜나 다른 정렬로 옮기면 그 랜덤 캐시와 시드를
/// 버리고, 다시 랜덤을 고르면 시드 없이 새로 연다. 탭 재선택·피드 복귀 재검증은 같은 표시 안이므로
/// 저장한 시드를 그대로 쓴다.
class DisplayViewModel extends ChangeNotifier {
  DisplayViewModel({
    required this._repository,
    required this._likes,
    required this._postEvents,
    required this._isGuest,
    this._clock = const KstClock(),
    this._initialDate,
    this._initialSort = DisplaySort.recent,
  }) : _today = _clock.today(),
       _sort = _initialSort {
    _selected = _clamp(_initialDate ?? _today);
    _settledSort = _initialSort;
    _likes.addListener(_onLikesChanged);
    _busSubscription = _postEvents.events.listen(_onPostEvent);
    _state = _buildState();
  }

  final DisplayRepository _repository;
  final LikeStore _likes;
  final PostEventBus _postEvents;
  final bool Function() _isGuest;
  final KstClock _clock;
  final KstDate? _initialDate;
  final DisplaySort _initialSort;

  final StreamController<DisplayEvent> _events =
      StreamController<DisplayEvent>.broadcast();
  late final StreamSubscription<PostEvent> _busSubscription;

  /// (날짜, 정렬) 캐시. 성공한 응답만 담는다.
  final Map<ExhibitKey, Exhibit> _cache = {};

  /// 제목 수정 이벤트로 알게 된 제목. 늦은 응답의 옛 제목보다 우선한다.
  final Map<String, String?> _titles = {};

  final Set<ExhibitKey> _revalidating = {};
  final Set<ExhibitKey> _paging = {};

  CancelToken _cancelToken = CancelToken();
  late DisplayState _state;
  late KstDate _selected;
  late DisplaySort _settledSort;
  KstDate _today;
  DisplaySort _sort;
  _Shown? _shown;
  _Pending? _pending;
  String? _failureText;
  int _featuredPage = 0;

  /// 날짜·정렬을 옮기려는 시도의 세대. 가장 최근 시도의 결과만 화면에 반영한다.
  int _navSeq = 0;

  /// 계정 전환 세대. 다르면 응답을 캐시에도 넣지 않고 버린다.
  int _epoch = 0;

  /// 랜덤 표시 세대. 랜덤 캐시를 버릴 때 오르고, 다르면 옛 랜덤 응답을 버린다.
  int _randomEpoch = 0;
  int _toastSequence = 0;
  int _likeSuppression = 0;
  bool _disposed = false;

  DisplayState get state => _state;

  /// broadcast. 화면이 보이는 동안만 구독한다.
  Stream<DisplayEvent> get events => _events.stream;

  Future<void> load() {
    _today = _clock.today();
    _sort = _initialSort;
    _settledSort = _initialSort;
    _selected = _clamp(_initialDate ?? _today);
    return _show(_selected);
  }

  /// error 상태의 "다시 시도". 같은 날짜로 다시 요청한다.
  Future<void> retry() => _show(_selected);

  Future<void> goPrevious() async {
    if (!_canGoPrevious) return;
    await _show(_selected.addDays(-1));
  }

  Future<void> goNext() async {
    if (!_canGoNext) return;
    await _show(_selected.addDays(1));
  }

  Future<void> selectDate(KstDate date) async {
    if (_isFirstLoading) return;
    final target = _clamp(date);
    if (target == _selected) return;
    await _show(target);
  }

  Future<void> selectSort(DisplaySort sort) async {
    if (_disposed || sort == _sort) return;
    _sort = sort;
    if (_selected < _today) {
      // 지난 날짜는 popular 고정이다. 고른 값은 오늘로 돌아올 때 복원한다.
      _publish();
      return;
    }
    await _show(_selected);
  }

  Future<void> onTabReselected() async {
    if (_disposed) return;
    _emit(const DisplayScrollToTop());
    await _refresh();
  }

  Future<void> onReturnedFromFeed() => _refresh();

  /// 화면이 다시 보일 때: KST 오늘만 다시 계산한다(보던 날짜·요청은 그대로).
  Future<void> onResumed() async {
    if (_disposed) return;
    _today = _clock.today();
    _publish();
  }

  Future<void> onAccountChanged() async {
    if (_disposed) return;
    _epoch++;
    _navSeq++;
    _randomEpoch++;
    _cancelToken.cancel();
    _cancelToken = CancelToken();
    _cache.clear();
    _titles.clear();
    _revalidating.clear();
    _paging.clear();
    _shown = null;
    _pending = null;
    _failureText = null;
    _featuredPage = 0;
    await load();
  }

  /// 스크롤로 마지막으로 보인 그리드 항목의 index.
  Future<void> onVisibleIndexChanged(int lastVisibleIndex) async {
    final exhibit = _shownExhibit;
    if (_disposed || exhibit == null) return;
    final visibleCount = _visibleCards(exhibit.cards).length;
    if (lastVisibleIndex < visibleCount - _prefetchThreshold) return;
    await _loadNextPage(exhibit);
  }

  void onFeaturedPageChanged(int page) {
    if (_disposed || page == _featuredPage) return;
    _featuredPage = page;
    _publish();
  }

  /// 사진 탭. 게스트는 토스트, 아니면 [DisplayOpenFeed]를 낸다(목록의 id·URL·좋아요·`isMine`·날짜가 시드).
  void onPostTapped(String postId) {
    if (_disposed) return;
    if (_isGuest()) {
      _toast(Copy.guestFeed);
      return;
    }
    final exhibit = _shownExhibit;
    if (exhibit == null) return;
    for (final card in _visibleCards(exhibit.cards)) {
      if (card.id != postId) continue;
      _emit(
        DisplayOpenFeed(
          FeedTarget.fromCard(card, topicDate: exhibit.topic.topicDate),
        ),
      );
      return;
    }
  }

  Future<void> onLikeTapped(String postId) => _likes.toggle(postId);

  @override
  void dispose() {
    _disposed = true;
    _cancelToken.cancel();
    _likes.removeListener(_onLikesChanged);
    unawaited(_busSubscription.cancel());
    unawaited(_events.close());
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // 날짜·정렬 이동
  // ---------------------------------------------------------------------------

  /// 마지막에서 세 번째 항목 이내(`index >= length - 3`)에서 다음 페이지를 요청한다.
  static const int _prefetchThreshold = 3;

  /// 추천 카드 수(REQ-DISP-018).
  static const int _featuredCount = 5;

  bool get _isFirstLoading => _shown == null && _failureText == null;

  bool get _canGoPrevious => !_isFirstLoading && _selected > KstDate.firstTopic;

  bool get _canGoNext => !_isFirstLoading && _selected < _today;

  Exhibit? get _shownExhibit {
    final key = _shown?.key;
    return key == null ? null : _cache[key];
  }

  KstDate _clamp(KstDate date) {
    if (date < KstDate.firstTopic) return KstDate.firstTopic;
    if (date > _today) return _today;
    return date;
  }

  /// 지난 날짜는 popular 고정, 오늘은 고른 정렬.
  ExhibitKey _keyFor(KstDate date) =>
      ExhibitKey(date, date < _today ? DisplaySort.popular : _sort);

  /// [date]의 전시를 보여 준다. 캐시가 있으면 즉시 바꾸고 재검증하며, 없으면 불러오는 동안
  /// 보이던 전시를 둔다. 가장 최근 시도의 결과만 화면에 반영한다.
  Future<void> _show(KstDate date) async {
    if (_disposed) return;
    final seq = ++_navSeq;
    final key = _keyFor(date);
    final isArchive = date < _today;
    _selected = date;

    if (_cache.containsKey(key)) {
      _commit(_Shown(date: date, key: key, isArchive: isArchive));
      await _revalidate(key);
      return;
    }

    _failureText = null;
    _pending = _Pending(isDateChange: _shown != null && _shown!.date != date);
    _publish();

    final outcome = await _fetchFirstPage(key);
    if (_disposed || seq != _navSeq || outcome is _Discarded) return;

    switch (outcome) {
      case _Loaded():
        _commit(_Shown(date: date, key: key, isArchive: isArchive));
      case _Failed(:final notFound, :final text, :final silent):
        _settleFailure(
          date: date,
          isArchive: isArchive,
          notFound: notFound,
          text: text,
          silent: silent,
        );
      case _Discarded():
        break;
    }
  }

  /// 실패를 화면에 반영한다. 보이는 전시가 있으면 복원하고 토스트, 없으면 빈/오류 상태.
  void _settleFailure({
    required KstDate date,
    required bool isArchive,
    required bool notFound,
    required String text,
    required bool silent,
  }) {
    _pending = null;
    final shown = _shown;
    if (shown == null) {
      if (notFound) {
        _commit(_Shown(date: date, key: null, isArchive: isArchive));
      } else {
        _failureText = text;
        _publish();
      }
      return;
    }
    _selected = shown.date;
    _sort = _settledSort;
    _publish();
    if (!silent) _toast(notFound ? Copy.displayDateMissing : text);
  }

  void _commit(_Shown shown) {
    final previous = _shown;
    if (previous == null || previous.date != shown.date) _featuredPage = 0;
    _dropRandomExcept(shown.key);
    _shown = shown;
    _pending = null;
    _failureText = null;
    if (!shown.isArchive) _settledSort = _sort;
    _publish();
  }

  /// 랜덤 시드는 한 번의 랜덤 표시 동안만 산다: 다른 곳으로 옮기면 랜덤 캐시를 버린다.
  void _dropRandomExcept(ExhibitKey? keep) {
    final stale = [
      for (final key in _cache.keys)
        if (key.isRandom && key != keep) key,
    ];
    if (stale.isEmpty) return;
    stale.forEach(_cache.remove);
    _randomEpoch++;
  }

  // ---------------------------------------------------------------------------
  // 요청
  // ---------------------------------------------------------------------------

  /// 주제를 확인하고 첫 페이지를 받아 캐시에 넣는다. 화면 반영은 호출한 쪽이 정한다.
  Future<_Outcome> _fetchFirstPage(ExhibitKey key) async {
    final epoch = _epoch;
    final randomEpoch = _randomEpoch;
    final since = _likes.version;
    bool isCurrent() => _isCurrentRequest(epoch, key, randomEpoch);
    try {
      final topic = await _repository.fetchTopic(
        key.date,
        cancelToken: _cancelToken,
      );
      if (!isCurrent()) return const _Discarded();
      final page = await _repository.fetchPosts(
        topicDate: topic.topicDate,
        sort: key.sort,
        page: 1,
        cancelToken: _cancelToken,
      );
      if (!isCurrent()) return const _Discarded();

      final existing = _cache[key];
      if (existing != null) {
        _mergeFirstPage(existing, page, since);
        return const _Loaded();
      }
      _cache[key] = Exhibit(
        key: key,
        topic: topic,
        firstPage: _ingest(page.posts, since),
        hasNext: page.hasNext,
        randomSeed: page.randomSeed,
      );
      return const _Loaded();
    } on Object catch (error, stack) {
      if (!isCurrent()) return const _Discarded();
      return _failure(error, stack);
    }
  }

  /// 캐시된 전시의 첫 페이지를 다시 받아 교체한다. 실패하면 기존 전시를 유지하고 토스트만.
  Future<void> _revalidate(ExhibitKey key) async {
    final exhibit = _cache[key];
    if (_disposed || exhibit == null || !_revalidating.add(key)) return;
    _publish();
    final epoch = _epoch;
    final since = _likes.version;
    try {
      // 재검증도 새 전시를 열 때와 같이 주제를 먼저 확인한 뒤 응답 topicDate로 부른다(REQ-DISP-002).
      final topic = await _repository.fetchTopic(
        key.date,
        cancelToken: _cancelToken,
      );
      if (!_isCurrentExhibit(epoch, exhibit)) return;
      final page = await _repository.fetchPosts(
        topicDate: topic.topicDate,
        sort: key.sort,
        page: 1,
        randomSeed: exhibit.randomSeed,
        cancelToken: _cancelToken,
      );
      if (_isCurrentExhibit(epoch, exhibit)) {
        exhibit.topic = topic;
        _mergeFirstPage(exhibit, page, since);
      }
    } on Object catch (error, stack) {
      if (_isCurrentExhibit(epoch, exhibit)) {
        _toastFailure(key, _failure(error, stack));
      }
    } finally {
      _revalidating.remove(key);
      _publish();
    }
  }

  Future<void> _refresh() async {
    if (_disposed) return;
    final key = _shown?.key;
    if (key != null) {
      await _revalidate(key);
    } else if (!_isFirstLoading) {
      // 빈/오류 상태에서는 같은 날짜를 처음부터 다시 연다.
      await _show(_selected);
    }
  }

  Future<void> _loadNextPage(Exhibit exhibit) async {
    final key = exhibit.key;
    if (!exhibit.canLoadMore ||
        _paging.contains(key) ||
        _revalidating.contains(key)) {
      return;
    }
    final epoch = _epoch;
    final page = exhibit.nextPage;
    final seed = exhibit.randomSeed;
    final since = _likes.version;
    _paging.add(key);
    _publish();
    try {
      final response = await _repository.fetchPosts(
        topicDate: exhibit.topic.topicDate,
        sort: key.sort,
        page: page,
        randomSeed: seed,
        cancelToken: _cancelToken,
      );
      final unchanged = exhibit.nextPage == page && exhibit.randomSeed == seed;
      if (_isCurrentExhibit(epoch, exhibit) && unchanged) {
        exhibit.appendPage(
          _ingest(response.posts, since),
          hasNext: response.hasNext,
        );
      }
    } on Object catch (error, stack) {
      if (_isCurrentExhibit(epoch, exhibit)) {
        _toastFailure(key, _failure(error, stack));
      }
    } finally {
      _paging.remove(key);
      _publish();
    }
  }

  void _mergeFirstPage(Exhibit exhibit, PostPage page, int since) {
    exhibit.applyFirstPage(
      _ingest(page.posts, since),
      hasNext: page.hasNext,
      randomSeed: page.randomSeed,
    );
  }

  bool _isCurrentRequest(int epoch, ExhibitKey key, int randomEpoch) =>
      !_disposed &&
      epoch == _epoch &&
      (!key.isRandom || randomEpoch == _randomEpoch);

  bool _isCurrentExhibit(int epoch, Exhibit exhibit) =>
      !_disposed && epoch == _epoch && identical(_cache[exhibit.key], exhibit);

  /// 응답 카드를 화면 값으로 맞추고 좋아요 저장소에 병합한다.
  /// 게스트는 응답 값과 무관하게 `isLiked`·`isMine`을 false로 다룬다(REQ-DISP-033).
  List<PostCard> _ingest(List<PostCard> posts, int since) {
    final cards = <PostCard>[];
    _likeSuppression++;
    try {
      for (final post in posts) {
        if (_postEvents.isRemoved(post.id)) continue;
        final card = _isGuest()
            ? post.copyWith(isLiked: false, isMine: false)
            : post;
        _likes.reconcile(
          card.id,
          isLiked: card.isLiked,
          likeCount: card.likeCount,
          since: since,
        );
        cards.add(card);
      }
    } finally {
      _likeSuppression--;
    }
    return cards;
  }

  // ---------------------------------------------------------------------------
  // 실패 처리
  // ---------------------------------------------------------------------------

  _Failed _failure(Object error, StackTrace stack) {
    if (error is! ApiError) {
      // 예상 밖 예외도 화면은 일반 실패로 두되, 버그가 묻히지 않게 보고한다.
      FlutterError.reportError(
        FlutterErrorDetails(
          exception: error,
          stack: stack,
          library: 'chalkak display',
        ),
      );
      return const _Failed(
        notFound: false,
        text: Copy.displayError,
        silent: false,
      );
    }
    return _Failed(
      notFound: error.status == 404,
      text: error.isNetwork ? Copy.commonErrorNetwork : Copy.displayError,
      // 취소는 화면을 떠났다는 뜻이고, 401은 앱이 세션 해제로 처리한다.
      silent: error.isCancelled || error.status == 401,
    );
  }

  /// 재검증·다음 페이지 실패: 보이는 전시일 때만 토스트로 알린다.
  void _toastFailure(ExhibitKey key, _Failed failure) {
    if (failure.silent || _shown?.key != key) return;
    _toast(failure.text);
  }

  // ---------------------------------------------------------------------------
  // 이벤트와 상태
  // ---------------------------------------------------------------------------

  void _onLikesChanged() {
    if (_likeSuppression == 0) _publish();
  }

  void _onPostEvent(PostEvent event) {
    if (event is PostTitleChanged) _titles[event.postId] = event.title;
    _publish();
  }

  void _toast(String text) =>
      _emit(DisplayToast(ToastMessage(id: ++_toastSequence, text: text)));

  void _emit(DisplayEvent event) {
    if (!_disposed) _events.add(event);
  }

  void _publish() {
    if (_disposed) return;
    _state = _buildState();
    notifyListeners();
  }

  /// 삭제된 게시물을 빼고, 제목과 좋아요를 최신 값으로 채운다.
  List<PostCard> _visibleCards(List<PostCard> cards) => [
    for (final card in cards)
      if (!_postEvents.isRemoved(card.id)) _latest(card),
  ];

  PostCard _latest(PostCard card) {
    final like = _likes.stateOf(card.id);
    final withLike = like == null
        ? card
        : card.copyWith(likeCount: like.likeCount, isLiked: like.isLiked);
    if (!_titles.containsKey(card.id)) return withLike;
    final title = _titles[card.id];
    return withLike.copyWith(title: title, clearTitle: title == null);
  }

  DisplayState _buildState() {
    final shown = _shown;
    final exhibit = _shownExhibit;
    final items = exhibit == null
        ? const <PostCard>[]
        : _visibleCards(exhibit.cards);
    final isArchive = shown?.isArchive ?? _selected < _today;
    final status = shown == null
        ? (_failureText == null ? DisplayStatus.loading : DisplayStatus.error)
        : (items.isEmpty ? DisplayStatus.empty : DisplayStatus.content);
    final featured = exhibit == null || !isArchive
        ? const <PostCard>[]
        : _visibleCards(exhibit.firstPage).take(_featuredCount).toList();
    final key = shown?.key;
    return DisplayState(
      selectedDate: _selected,
      today: _today,
      status: status,
      sort: _sort,
      isArchive: isArchive,
      showSortTabs: !isArchive,
      canGoPrevious: _canGoPrevious,
      canGoNext: _canGoNext,
      dateLabel: _monthDay(exhibit?.topic.topicDate ?? _selected),
      description: isArchive
          ? Copy.displayHeaderDescArchive
          : Copy.displayHeaderDescLatest,
      topic: exhibit?.topic,
      items: List.unmodifiable(items),
      featured: List.unmodifiable(featured),
      featuredPage: _featuredPage,
      hasNext: exhibit?.canLoadMore ?? false,
      isRefreshing:
          (_pending != null && !_pending!.isDateChange) ||
          (key != null && _revalidating.contains(key)),
      isPaging: key != null && _paging.contains(key),
      isNavigating: _pending?.isDateChange ?? false,
      errorText: status == DisplayStatus.error ? _failureText : null,
    );
  }

  static String _monthDay(KstDate date) => '${date.month}월 ${date.day}일';
}

/// 지금 화면에 보이는 전시. [key]가 null이면 캐시 없이 비어 있는 날짜(주제 404)다.
class _Shown {
  const _Shown({
    required this.date,
    required this.key,
    required this.isArchive,
  });

  final KstDate date;
  final ExhibitKey? key;
  final bool isArchive;
}

/// 불러오는 중인 이동. 날짜가 바뀌면 [isDateChange], 같은 날짜의 정렬 변경이면 아니다.
class _Pending {
  const _Pending({required this.isDateChange});

  final bool isDateChange;
}

sealed class _Outcome {
  const _Outcome();
}

/// 캐시에 담았다.
final class _Loaded extends _Outcome {
  const _Loaded();
}

/// 화면을 떠났거나 계정이 바뀌어 결과를 버린다.
final class _Discarded extends _Outcome {
  const _Discarded();
}

final class _Failed extends _Outcome {
  const _Failed({
    required this.notFound,
    required this.text,
    required this.silent,
  });

  /// 주제·전시가 없다(404).
  final bool notFound;
  final String text;

  /// 토스트를 내지 않는 실패(취소, 401).
  final bool silent;
}
