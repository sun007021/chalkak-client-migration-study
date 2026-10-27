import 'dart:async';
import 'dart:convert';
import 'dart:ui' show Tristate;

import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:chalkak/features/display/domain/display_repository.dart';
import 'package:chalkak/features/display/presentation/display_view_model.dart';
import 'package:chalkak/features/feed/domain/feed_target.dart';
import 'package:chalkak/features/feed/domain/post_detail.dart';
import 'package:chalkak/features/feed/domain/post_event_bus.dart';
import 'package:chalkak/features/feed/domain/post_repository.dart';
import 'package:chalkak/features/feed/presentation/feed_view_model.dart';
import 'package:chalkak/features/like/domain/like_repository.dart';
import 'package:chalkak/features/like/domain/like_store.dart';
import 'package:chalkak/features/like/domain/toast_message.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fixtures.dart';
import 'ui_helpers.dart';

export 'ui_helpers.dart';

// ---------------------------------------------------------------------------
// 고정 값 (shared/fixtures/README.md §2)
// ---------------------------------------------------------------------------

/// 내 userId(사용자 A).
const myUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/// 다른 작성자(사용자 B).
const otherUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/// 내 오늘 게시물. 좋아요·수정·삭제 fixture가 모두 이 id를 가리킨다.
const myPostId = '22222222-2222-4222-8222-222222222201';

/// 다른 사람 게시물 `…2222222222NN`.
String postIdOf(int nn) =>
    '22222222-2222-4222-8222-2222222222${nn.toString().padLeft(2, '0')}';

/// 가짜 시계가 가리키는 KST 오늘(FIXTURE_NOW).
final KstDate today = KstDate.parse('2026-10-27');

KstDate day(String yyyyMmDd) => KstDate.parse(yyyyMmDd);

const topicOpenFx = 'display/topics__open-2026-10-27.json';
const topicPastFx = 'display/topics__open-2026-10-26.json';
const topicFirstFx = 'display/topics__first-date-2026-09-17.json';
const topic404Fx = 'display/topics__404-not-found.json';
const topic500Fx = 'display/topics__500-server-error.json';
const recentP1Fx = 'display/posts-list__recent-page1.json';
const recentP2Fx = 'display/posts-list__recent-page2.json';
const recentP2OverlapFx = 'display/posts-list__recent-page2-overlap.json';
const popularP1Fx = 'display/posts-list__popular-page1.json';
const popular3Fx = 'display/posts-list__popular-3.json';
const randomP1Fx = 'display/posts-list__random-page1-seed.json';
const randomP2Fx = 'display/posts-list__random-page2.json';
const randomP2OverlapFx = 'display/posts-list__random-page2-overlap.json';
const randomNoSeedFx = 'display/posts-list__random-no-seed.json';
const page99Fx = 'display/posts-list__page99-empty.json';
const posts404Fx = 'display/posts-list__404-topic-not-found.json';
const posts500Fx = 'display/posts-list__500-server-error.json';
const posts400FutureFx = 'display/posts-list__400-future-date.json';
const posts400QueryFx = 'display/posts-list__400-bad-query.json';
const guestP1Fx = 'display/posts-list__guest-page1.json';

const detailMineTodayFx = 'feed/posts-detail__mine-today.json';
const detailMinePastFx = 'feed/posts-detail__mine-past.json';
const detailOtherFx = 'feed/posts-detail__other.json';
const detailNoTitleFx = 'feed/posts-detail__no-title.json';
const detail404Fx = 'feed/posts-detail__404-not-found.json';
const detail500Fx = 'feed/posts-detail__500-server-error.json';
const detailInvalidFx = 'feed/posts-detail__invalid-schema.json';
const detail400Fx = 'feed/posts-detail__400-invalid-id.json';
const titleOkFx = 'feed/posts-title-update__200.json';
const titleNullFx = 'feed/posts-title-update__200-null-title.json';
const title400StateFx = 'feed/posts-title-update__400-not-editable.json';
const title400LongFx = 'feed/posts-title-update__400-title-too-long.json';
const title401Fx = 'feed/posts-title-update__401-unauthorized.json';
const title403Fx = 'feed/posts-title-update__403-banned.json';
const title404Fx = 'feed/posts-title-update__404-not-found.json';
const title500Fx = 'feed/posts-title-update__500-server-error.json';
const delete204Fx = 'feed/posts-delete__204.json';
const delete400ValidatingFx = 'feed/posts-delete__400-validating.json';
const delete400RejectedFx = 'feed/posts-delete__400-rejected.json';
const delete401Fx = 'feed/posts-delete__401-unauthorized.json';
const delete403Fx = 'feed/posts-delete__403-not-owner.json';
const delete404Fx = 'feed/posts-delete__404-not-found.json';
const delete500Fx = 'feed/posts-delete__500-server-error.json';

// ---------------------------------------------------------------------------
// fixture -> 모델 (구현의 파서와 별개로 테스트가 직접 푼다)
// ---------------------------------------------------------------------------

Map<String, dynamic> _map(Object? v) => (v! as Map).cast<String, dynamic>();

PostCard cardFromJson(Map<String, dynamic> j) => PostCard(
  id: j['id'] as String,
  authorId: j['authorId'] as String,
  originalImageUrl: j['originalImageUrl'] as String,
  thumbnailImageUrl:
      (j['thumbnailImageUrl'] as String?) ?? j['originalImageUrl'] as String,
  signatureOriginalImageUrl: j['signatureOriginalImageUrl'] as String,
  signatureThumbnailImageUrl: j['signatureThumbnailImageUrl'] as String?,
  title: j['title'] as String?,
  likeCount: j['likeCount'] as int,
  isLiked: j['isLiked'] as bool,
  isMine: j['isMine'] as bool,
);

PostPage pageFx(String name) {
  final j = _map(Fixture.load(name));
  return PostPage(
    currentPage: j['currentPage'] as int,
    pageSize: j['pageSize'] as int,
    hasNext: j['hasNext'] as bool,
    randomSeed: j['randomSeed'] as String?,
    posts: [for (final p in j['posts'] as List) cardFromJson(_map(p))],
  );
}

/// fixture의 게시물 id 목록(순서 그대로).
List<String> idsOf(String name) => [
  for (final p in _map(Fixture.load(name))['posts'] as List)
    _map(p)['id'] as String,
];

PostCard cardOf(String fixture, String postId) =>
    pageFx(fixture).posts.firstWhere((c) => c.id == postId);

DisplayTopic topicFx(String name, {String? phase}) {
  final j = _map(Fixture.load(name));
  return DisplayTopic(
    id: j['id'] as String,
    title: j['title'] as String,
    topicDate: KstDate.parse(j['topicDate'] as String),
    phase: phase ?? j['phase'] as String,
  );
}

/// 어떤 날짜든 그 날짜의 주제(제목은 날짜 문자열).
DisplayTopic topicOn(KstDate date, {String phase = 'OPEN'}) => DisplayTopic(
  id: '11111111-1111-4111-8111-1111111111${date.day.toString().padLeft(2, '0')}',
  title: '주제 ${date.toApiString()}',
  topicDate: date,
  phase: phase,
);

PostDetail detailFx(String name) {
  final j = _map(Fixture.load(name));
  final topic = _map(j['topic']);
  return PostDetail(
    id: j['id'] as String,
    authorId: j['authorId'] as String,
    topicId: topic['id'] as String,
    topicTitle: topic['title'] as String,
    topicDate: KstDate.parse(topic['topicDate'] as String),
    originalImageUrl: j['originalImageUrl'] as String,
    thumbnailImageUrl:
        (j['thumbnailImageUrl'] as String?) ?? j['originalImageUrl'] as String,
    signatureOriginalImageUrl: j['signatureOriginalImageUrl'] as String,
    title: j['title'] as String?,
    likeCount: j['likeCount'] as int,
    isLiked: j['isLiked'] as bool,
  );
}

PostTitleResult titleResultFx(String name) {
  final j = _map(Fixture.load(name));
  return PostTitleResult(
    postId: j['postId'] as String,
    title: j['title'] as String?,
  );
}

LikeResult likeResultFx(String name) {
  final j = _map(Fixture.load(name));
  return LikeResult(
    postId: j['postId'] as String,
    likeCount: j['likeCount'] as int,
    isLiked: j['isLiked'] as bool,
  );
}

/// 오류 fixture를 [ApiError]로 만든다. 연결 실패 fixture(`_fault`)는 network 오류다.
ApiError errorFx(String name) {
  final r = Fixture.response(name);
  if (r.isFault) return ApiError.network();
  return ApiError.fromErrorResponse(r.route.status!, r.bodyText);
}

ApiError networkError() => ApiError.network();

// ---------------------------------------------------------------------------
// 스크립트된 응답
// ---------------------------------------------------------------------------

/// Fake 저장소가 돌려줄 응답 하나. [gate]를 주면 그 Future가 끝날 때까지 기다린다.
class Reply<T> {
  Reply.ok(this.value, {this.delay = Duration.zero, this.gate}) : error = null;
  Reply.fail(ApiError this.error, {this.delay = Duration.zero, this.gate})
    : value = null;

  final T? value;
  final ApiError? error;
  final Duration delay;
  final Future<void>? gate;
}

/// 호출마다 다음 응답을 꺼낸다. 마지막 응답은 반복된다.
class _Script<T> {
  _Script(List<Reply<T>> replies) : _queue = [...replies];
  final List<Reply<T>> _queue;

  Reply<T> next() => _queue.length > 1 ? _queue.removeAt(0) : _queue.first;
}

Future<T> _play<T>(Reply<T> r) async {
  final gate = r.gate;
  if (gate != null) await gate;
  if (r.delay > Duration.zero) await Future<void>.delayed(r.delay);
  final e = r.error;
  if (e != null) throw e;
  return r.value as T;
}

// ---------------------------------------------------------------------------
// FakeDisplayRepository
// ---------------------------------------------------------------------------

class PostsCall {
  PostsCall(this.date, this.sort, this.page, this.randomSeed);
  final KstDate date;
  final DisplaySort sort;
  final int page;
  final String? randomSeed;

  @override
  String toString() =>
      'PostsCall(${date.toApiString()}, ${sort.wire}, p$page, seed: $randomSeed)';
}

class FakeDisplayRepository implements DisplayRepository {
  final List<KstDate> topicCalls = [];
  final List<PostsCall> postsCalls = [];
  final Map<String, _Script<DisplayTopic>> _topics = {};
  final Map<String, _Script<PostPage>> _posts = {};

  /// 스크립트 없는 날짜의 주제는 [topicOn]으로 만든다.
  bool autoTopics = true;

  void onTopic(KstDate date, List<Reply<DisplayTopic>> replies) {
    _topics[date.toApiString()] = _Script(replies);
  }

  void onPosts(
    KstDate date,
    DisplaySort sort,
    int page,
    List<Reply<PostPage>> replies,
  ) {
    _posts[_key(date, sort, page)] = _Script(replies);
  }

  /// 한 줄 편의: 날짜의 (정렬, 페이지)에 fixture 페이지 하나.
  void servePage(
    KstDate date,
    DisplaySort sort,
    int page,
    String fixture, {
    Duration delay = Duration.zero,
  }) => onPosts(date, sort, page, [Reply.ok(pageFx(fixture), delay: delay)]);

  static String _key(KstDate d, DisplaySort s, int p) =>
      '${d.toApiString()}|${s.wire}|$p';

  List<PostsCall> callsFor(DisplaySort sort, {KstDate? date}) => [
    for (final c in postsCalls)
      if (c.sort == sort && (date == null || c.date == date)) c,
  ];

  @override
  Future<DisplayTopic> fetchTopic(KstDate date, {CancelToken? cancelToken}) {
    topicCalls.add(date);
    final script = _topics[date.toApiString()];
    if (script == null) {
      if (!autoTopics) throw StateError('스크립트 없는 topics $date');
      return Future.value(topicOn(date));
    }
    return _play(script.next());
  }

  @override
  Future<PostPage> fetchPosts({
    required KstDate topicDate,
    required DisplaySort sort,
    required int page,
    String? randomSeed,
    CancelToken? cancelToken,
  }) {
    postsCalls.add(PostsCall(topicDate, sort, page, randomSeed));
    final script = _posts[_key(topicDate, sort, page)];
    if (script == null) {
      throw StateError('스크립트 없는 posts ${postsCalls.last}');
    }
    return _play(script.next());
  }
}

// ---------------------------------------------------------------------------
// FakePostRepository
// ---------------------------------------------------------------------------

class FakePostRepository implements PostRepository {
  final List<String> detailCalls = [];
  final List<({String postId, String? title})> titleCalls = [];
  final List<String> deleteCalls = [];
  final Map<String, _Script<PostDetail>> _details = {};
  final Map<String, _Script<PostTitleResult>> _titles = {};
  final Map<String, _Script<Object?>> _deletes = {};

  void onDetail(String postId, List<Reply<PostDetail>> replies) {
    _details[postId] = _Script(replies);
  }

  void onUpdateTitle(String postId, List<Reply<PostTitleResult>> replies) {
    _titles[postId] = _Script(replies);
  }

  void onDelete(String postId, List<Reply<Object?>> replies) {
    _deletes[postId] = _Script(replies);
  }

  @override
  Future<PostDetail> fetchDetail(String postId, {CancelToken? cancelToken}) {
    detailCalls.add(postId);
    final s = _details[postId];
    if (s == null) throw StateError('스크립트 없는 detail $postId');
    return _play(s.next());
  }

  @override
  Future<PostTitleResult> updateTitle(
    String postId,
    String? title, {
    CancelToken? cancelToken,
  }) {
    titleCalls.add((postId: postId, title: title));
    final s = _titles[postId];
    if (s == null) throw StateError('스크립트 없는 updateTitle $postId');
    return _play(s.next());
  }

  @override
  Future<void> deletePost(String postId, {CancelToken? cancelToken}) {
    deleteCalls.add(postId);
    final s = _deletes[postId];
    if (s == null) throw StateError('스크립트 없는 deletePost $postId');
    return _play(s.next());
  }
}

// ---------------------------------------------------------------------------
// FakeLikeRepository
// ---------------------------------------------------------------------------

/// 저장소가 받은 좋아요 호출 하나. 수동 모드에서 테스트가 [succeed]·[fail]로 끝낸다.
class LikeCall {
  LikeCall(this.postId, this.like);

  /// true = PUT(등록), false = DELETE(취소).
  final bool like;
  final String postId;
  final Completer<LikeResult> _done = Completer<LikeResult>();
  bool _finished = false;
  bool get isDone => _finished;

  /// 서버 상태를 이 호출대로 바꾸고 응답한다. [likeCount]·[isLiked]로 응답을 덮어쓸 수 있다.
  void succeed(FakeLikeRepository repo, {int? likeCount, bool? isLiked}) {
    final applied = repo.apply(postId, like);
    _finished = true;
    _done.complete(
      LikeResult(
        postId: postId,
        likeCount: likeCount ?? applied.likeCount,
        isLiked: isLiked ?? applied.isLiked,
      ),
    );
  }

  void fail(ApiError error) {
    _finished = true;
    _done.completeError(error);
  }
}

class FakeLikeRepository implements LikeRepository {
  FakeLikeRepository({this.manual = false});

  /// true면 호출이 쌓이고 테스트가 [LikeCall.succeed]·[LikeCall.fail]로 끝낸다.
  final bool manual;

  /// 자동 모드의 응답 지연.
  Duration delay = Duration.zero;

  /// 자동 모드에서 다음 호출들이 실패할 오류(앞에서부터 하나씩 소비, null이면 성공).
  final List<ApiError?> failures = [];

  /// 서버가 가진 상태. 없는 게시물은 `isLiked=false, likeCount=10`으로 시작한다.
  final Map<String, LikeResult> server = {};
  final List<LikeCall> calls = [];

  int get callCount => calls.length;
  int get putCount => calls.where((c) => c.like).length;
  int get deleteCount => calls.where((c) => !c.like).length;

  /// 같은 게시물에 동시에 진행 중이었던 호출 수의 최댓값(직렬화 검증용).
  int maxInFlightByPost = 0;

  void seedServer(String postId, {bool isLiked = false, int likeCount = 10}) {
    server[postId] = LikeResult(
      postId: postId,
      likeCount: likeCount,
      isLiked: isLiked,
    );
  }

  /// 서버 의미: 등록·취소 모두 멱등.
  LikeResult apply(String postId, bool like) {
    final cur =
        server[postId] ??
        LikeResult(postId: postId, likeCount: 10, isLiked: false);
    final next = cur.isLiked == like
        ? cur
        : LikeResult(
            postId: postId,
            likeCount: cur.likeCount + (like ? 1 : -1),
            isLiked: like,
          );
    server[postId] = next;
    return next;
  }

  Future<LikeResult> _handle(String postId, bool like) async {
    final call = LikeCall(postId, like);
    calls.add(call);
    final sameInFlight = calls
        .where((c) => c.postId == postId && !c.isDone)
        .length;
    if (sameInFlight > maxInFlightByPost) maxInFlightByPost = sameInFlight;
    if (manual) {
      return call._done.future;
    }
    if (delay > Duration.zero) await Future<void>.delayed(delay);
    final err = failures.isEmpty ? null : failures.removeAt(0);
    call._finished = true;
    if (err != null) throw err;
    return apply(postId, like);
  }

  @override
  Future<LikeResult> like(String postId, {CancelToken? cancelToken}) =>
      _handle(postId, true);

  @override
  Future<LikeResult> unlike(String postId, {CancelToken? cancelToken}) =>
      _handle(postId, false);
}

// ---------------------------------------------------------------------------
// Rig: 가짜 의존성으로 조립한 ViewModel 묶음
// ---------------------------------------------------------------------------

/// 좋아요 저장소 + 가짜 서버. 토스트를 모아 둔다.
class LikeRig {
  /// [listen]이 false이면 토스트를 구독하지 않는다(화면이 보이지 않는 상태).
  LikeRig({bool guest = false, bool manual = false, bool listen = true})
    : repo = FakeLikeRepository(manual: manual),
      bus = PostEventBus() {
    store = LikeStore(repository: repo, events: bus, isGuest: () => guest);
    if (listen) store.toasts.listen(toasts.add);
    bus.events.listen(busEvents.add);
  }

  final FakeLikeRepository repo;
  final PostEventBus bus;
  late final LikeStore store;
  final List<ToastMessage> toasts = [];
  final List<PostEvent> busEvents = [];

  List<String> get toastTexts => [for (final t in toasts) t.text];
  List<String> get removedIds => [
    for (final e in busEvents)
      if (e is PostRemoved) e.postId,
  ];

  /// 목록 응답을 본 것처럼 값을 넣는다(서버 상태도 같게 맞춘다).
  void see(String postId, {bool isLiked = false, int likeCount = 10}) {
    repo.seedServer(postId, isLiked: isLiked, likeCount: likeCount);
    store.reconcile(
      postId,
      isLiked: isLiked,
      likeCount: likeCount,
      since: store.version,
    );
  }
}

class DisplayRig {
  DisplayRig({
    bool guest = false,
    KstDate? initialDate,
    DisplaySort initialSort = DisplaySort.recent,
    bool manualLikes = false,
  }) : repo = FakeDisplayRepository(),
       likeRepo = FakeLikeRepository(manual: manualLikes),
       bus = PostEventBus() {
    likes = LikeStore(repository: likeRepo, events: bus, isGuest: () => guest);
    vm = DisplayViewModel(
      repository: repo,
      likes: likes,
      postEvents: bus,
      isGuest: guest,
      initialDate: initialDate,
      initialSort: initialSort,
    );
    vm.events.listen(events.add);
    likes.toasts.listen(likeToasts.add);
  }

  final FakeDisplayRepository repo;
  final FakeLikeRepository likeRepo;
  final PostEventBus bus;
  late final LikeStore likes;
  late final DisplayViewModel vm;
  final List<DisplayEvent> events = [];
  final List<ToastMessage> likeToasts = [];

  DisplayState get state => vm.state;
  List<String> get itemIds => [for (final c in state.items) c.id];
  List<String> get featuredIds => [for (final c in state.featured) c.id];

  List<String> get toastTexts => [
    for (final e in events)
      if (e is DisplayToast) e.message.text,
    for (final t in likeToasts) t.text,
  ];
  List<FeedTarget> get openedFeeds => [
    for (final e in events)
      if (e is DisplayOpenFeed) e.target,
  ];
  int get scrollToTopCount => events.whereType<DisplayScrollToTop>().length;

  PostCard card(String id) => state.items.firstWhere((c) => c.id == id);

  /// 오늘 최신순 1페이지(주제는 자동)를 서버에 걸어 둔다.
  void serveTodayRecent({bool withPage2 = false}) {
    repo.servePage(today, DisplaySort.recent, 1, recentP1Fx);
    if (withPage2) repo.servePage(today, DisplaySort.recent, 2, recentP2Fx);
  }
}

class FeedRig {
  FeedRig({
    required FeedTarget target,
    String? userId = myUserId,
    bool manualLikes = false,
  }) : repo = FakePostRepository(),
       likeRepo = FakeLikeRepository(manual: manualLikes),
       bus = PostEventBus() {
    likes = LikeStore(repository: likeRepo, events: bus, isGuest: () => false);
    vm = FeedViewModel(
      target: target,
      repository: repo,
      likes: likes,
      postEvents: bus,
      userId: userId,
    );
    vm.events.listen(events.add);
    likes.toasts.listen(likeToasts.add);
    bus.events.listen(busEvents.add);
  }

  final FakePostRepository repo;
  final FakeLikeRepository likeRepo;
  final PostEventBus bus;
  late final LikeStore likes;
  late final FeedViewModel vm;
  final List<FeedEvent> events = [];
  final List<ToastMessage> likeToasts = [];
  final List<PostEvent> busEvents = [];

  FeedState get state => vm.state;
  List<String> get toastTexts => [
    for (final e in events)
      if (e is FeedToast) e.message.text,
    for (final t in likeToasts) t.text,
  ];
  int get closeCount => events.whereType<FeedClose>().length;
  List<String> get removedIds => [
    for (final e in busEvents)
      if (e is PostRemoved) e.postId,
  ];
  List<PostTitleChanged> get titleChanges =>
      busEvents.whereType<PostTitleChanged>().toList();
}

/// 전시 카드로 여는 FeedTarget(전시 fixture의 카드).
FeedTarget targetFromCard(String fixture, String postId, {KstDate? date}) =>
    FeedTarget.fromCard(cardOf(fixture, postId), topicDate: date ?? today);

/// 기록·푸시로 여는 FeedTarget: 시드 없이 내 게시물.
FeedTarget targetFromRecord(String postId, {String? thumbnailUrl}) =>
    FeedTarget(
      postId: postId,
      origin: FeedOrigin.record,
      isMine: true,
      thumbnailUrl: thumbnailUrl,
    );

String encodeJson(Object o) => jsonEncode(o);

/// testids.md §2: 탭·필터·정렬·좋아요 버튼은 selected를 접근성 속성으로 노출한다.
bool isSelected(WidgetTester tester, String id) =>
    tester
        .getSemantics(byId(id))
        .getSemanticsData()
        .flagsCollection
        .isSelected ==
    Tristate.isTrue;
