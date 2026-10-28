import 'dart:async';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/push/notification_permission.dart';
import 'package:chalkak/core/push/push_message_source.dart';
import 'package:chalkak/core/push/push_payload.dart';
import 'package:chalkak/core/push/push_token_provider.dart';
import 'package:chalkak/features/feed/domain/feed_target.dart';
import 'package:chalkak/features/notification/domain/notification_models.dart';
import 'package:chalkak/features/notification/domain/notification_navigator.dart';
import 'package:chalkak/features/notification/domain/notification_permission_prompt.dart';
import 'package:chalkak/features/notification/domain/notification_repository.dart';
import 'package:chalkak/features/notification/domain/notification_tap_runner.dart';
import 'package:chalkak/features/notification/domain/pending_push_store.dart';
import 'package:chalkak/features/notification/domain/push_device_repository.dart';
import 'package:chalkak/features/notification/domain/push_foreground_handler.dart';
import 'package:chalkak/features/notification/domain/session_refresher.dart';
import 'package:chalkak/features/notification/domain/unread_refresher.dart';
import 'package:chalkak/features/notification/presentation/notification_detail_view_model.dart';
import 'package:chalkak/features/notification/presentation/notification_inbox_view_model.dart';
import 'package:dio/dio.dart';

import 'display_fakes.dart';
import 'fake_analytics_tracker.dart';
import 'fixtures.dart';
import 'home_fakes.dart' show RecordingToast;

export 'display_fakes.dart';
export 'home_fakes.dart' show RecordingToast;

// ---------------------------------------------------------------------------
// 고정 값 (shared/fixtures/notification/README.md, push/README.md)
// ---------------------------------------------------------------------------

/// 알림 id `3333…33NN`.
String notiId(int nn) =>
    '33333333-3333-4333-8333-3333333333${nn.toString().padLeft(2, '0')}';

const noticeSourceId = '77777777-7777-4777-8777-777777777701';

const pageFx1 = 'notification/notifications__page1.json';
const pageFx2Last = 'notification/notifications__page2-last.json';
const pageFxOverlap = 'notification/notifications__overlap-page2.json';
const pageFxEmpty = 'notification/notifications__empty.json';
const pageFxUnknownType = 'notification/notifications__unknown-type.json';
const pageFxTopicReminder = 'notification/notifications__topic-reminder.json';
const pageFxNullSource = 'notification/notifications__null-source.json';
const pageFxBadAiSource = 'notification/notifications__bad-ai-source.json';
const pageFxKst = 'notification/notifications__kst-boundary.json';
const pageFx30Day = 'notification/notifications__30day-boundary.json';
const pageFx500 = 'notification/notifications__internal-error.json';
const pageFx404 = 'notification/notifications__not-found.json';
const pageFx401 = 'notification/notifications__unauthorized.json';
const pageFxMissing = 'notification/notifications__missing-fields.json';
const readOkFx = 'notification/notification-read__no-content.json';
const read404Fx = 'notification/notification-read__not-found.json';
const read500Fx = 'notification/notification-read__internal-error.json';
const read401Fx = 'notification/notification-read__unauthorized.json';
const detailRejectedFx = 'notification/notification-detail__rejected.json';
const detailNoticeFx = 'notification/notification-detail__notice.json';
const detailApprovedFx = 'notification/notification-detail__approved.json';
const detailLongFx =
    'notification/notification-detail__rejected-long-reason.json';
const notiDetail404Fx = 'notification/notification-detail__not-found.json';
const notiDetail500Fx = 'notification/notification-detail__internal-error.json';

// ---------------------------------------------------------------------------
// fixture -> 모델 (구현의 파서와 별개로 테스트가 직접 푼다)
// ---------------------------------------------------------------------------

Map<String, dynamic> _map(Object? v) => (v! as Map).cast<String, dynamic>();

NotificationType _typeOf(String raw) => switch (raw) {
  'POST_APPROVED' => NotificationType.postApproved,
  'POST_REJECTED' => NotificationType.postRejected,
  'AI_REVIEW_COMPLETED' => NotificationType.aiReviewCompleted,
  'AI_REVIEW_FAILED' => NotificationType.aiReviewFailed,
  'NOTICE' => NotificationType.notice,
  'TOPIC' => NotificationType.topic,
  'REMINDER' => NotificationType.reminder,
  _ => NotificationType.unknown,
};

NotificationItem itemFromJson(Map<String, dynamic> j) => NotificationItem(
  id: j['id'] as String,
  type: _typeOf(j['type'] as String),
  rawType: j['type'] as String,
  sourceType: j['sourceType'] as String?,
  sourceId: j['sourceId'] as String?,
  title: j['title'] as String,
  body: j['body'] as String,
  thumbnailImageUrl: j['thumbnailImageUrl'] as String?,
  readAt: j['readAt'] == null ? null : DateTime.parse(j['readAt'] as String),
  createdAt: DateTime.parse(j['createdAt'] as String),
);

NotificationPage notiPageFx(String name) {
  final j = _map(Fixture.load(name));
  return NotificationPage(
    currentPage: j['currentPage'] as int,
    pageSize: j['pageSize'] as int,
    hasNext: j['hasNext'] as bool,
    items: [for (final n in j['notifications'] as List) itemFromJson(_map(n))],
  );
}

NotificationItem itemFx(String name, String id) =>
    notiPageFx(name).items.firstWhere((i) => i.id == id);

/// fixture 목록의 id 순서.
List<String> notiIdsOf(String name) => [
  for (final n in _map(Fixture.load(name))['notifications'] as List)
    _map(n)['id'] as String,
];

NotificationDetail notiDetailFx(String name) {
  final j = _map(Fixture.load(name));
  return NotificationDetail(
    id: j['id'] as String,
    type: _typeOf(j['type'] as String),
    rawType: j['type'] as String,
    title: j['title'] as String,
    body: j['body'] as String,
    originalImageUrl: j['originalImageUrl'] as String?,
    rejectionReason: j['rejectionReason'] as String?,
    readAt: j['readAt'] == null ? null : DateTime.parse(j['readAt'] as String),
    createdAt: DateTime.parse(j['createdAt'] as String),
  );
}

/// 항목 하나를 직접 만든다(fixture에 없는 조합).
NotificationItem makeItem({
  String? id,
  String rawType = 'POST_APPROVED',
  String? sourceType = 'POST',
  String? sourceId = myPostId,
  DateTime? readAt,
}) => NotificationItem(
  id: id ?? notiId(1),
  type: _typeOf(rawType),
  rawType: rawType,
  sourceType: sourceType,
  sourceId: sourceId,
  title: '제목',
  body: '본문',
  readAt: readAt,
  createdAt: DateTime.utc(2026, 10, 27, 1),
);

/// 푸시 fixture의 `data`를 직접 푼다(문자열이 아닌 값은 없는 필드). 구현의 `fromData`와 별개다.
PushPayload pushPayloadFx(String name) {
  final data = _map(_map(Fixture.load('push/$name.json'))['data']);
  String? str(String key) => data[key] is String ? data[key] as String : null;
  return PushPayload(
    type: str('type'),
    notificationId: str('notificationId'),
    sourceType: str('sourceType'),
    sourceId: str('sourceId'),
    eventId: str('eventId'),
  );
}

/// 푸시 fixture의 `data` 원본 맵(어댑터 입력).
Map<Object?, Object?> pushDataFx(String name) =>
    _map(_map(Fixture.load('push/$name.json'))['data'])
        .cast<Object?, Object?>();

PushMessage pushMessageFx(String name) {
  final j = _map(Fixture.load('push/$name.json'));
  final n = j['notification'] == null ? null : _map(j['notification']);
  return PushMessage(
    payload: pushPayloadFx(name),
    title: n?['title'] as String?,
    body: n?['body'] as String?,
  );
}

PushPayload payloadOf({
  String? type,
  String? notificationId,
  String? sourceType,
  String? sourceId,
  String? eventId,
}) => PushPayload(
  type: type,
  notificationId: notificationId,
  sourceType: sourceType,
  sourceId: sourceId,
  eventId: eventId,
);

/// JWT fixture의 토큰.
String jwtFx(String name) =>
    _map(Fixture.load('push/$name.json'))['token'] as String;

/// 토큰 문자열을 액세스 토큰으로 가진 회원 세션.
Session sessionWithJwt(String jwt, {String userId = myUserId}) => Session(
  userId: userId,
  accessToken: jwt,
  accessTokenExpiresAt: DateTime.utc(2026, 10, 27, 3, 15),
  refreshToken: 'rt-$userId',
  refreshTokenExpiresAt: DateTime.utc(2026, 11, 26, 3),
);

// ---------------------------------------------------------------------------
// FakeNotificationRepository
// ---------------------------------------------------------------------------

Future<T> _play<T>(Reply<T> r, CancelToken? token) async {
  final gate = r.gate;
  if (gate != null) await gate;
  if (r.delay > Duration.zero) await Future<void>.delayed(r.delay);
  if (token?.isCancelled ?? false) throw ApiError.cancelled();
  final e = r.error;
  if (e != null) throw e;
  return r.value as T;
}

/// 호출마다 다음 응답을 꺼낸다. 마지막 응답은 반복된다.
class _Queue<T> {
  _Queue(List<Reply<T>> replies) : _items = [...replies];
  final List<Reply<T>> _items;
  Reply<T> next() => _items.length > 1 ? _items.removeAt(0) : _items.first;
}

class FakeNotificationRepository implements NotificationRepository {
  final List<({int page, int pageSize})> pageCalls = [];
  final List<String> detailCalls = [];
  final List<String> readCalls = [];
  final Map<int, _Queue<NotificationPage>> _pages = {};
  final Map<String, _Queue<NotificationDetail>> _details = {};
  final Map<String, _Queue<void>> _reads = {};

  /// 스크립트 없는 읽음 요청의 기본 응답(204).
  Reply<void> defaultRead = Reply<void>.ok(null);

  void onPage(int page, List<Reply<NotificationPage>> replies) {
    _pages[page] = _Queue(replies);
  }

  void servePage(int page, String fixture) =>
      onPage(page, [Reply.ok(notiPageFx(fixture))]);

  void onDetail(String id, List<Reply<NotificationDetail>> replies) {
    _details[id] = _Queue(replies);
  }

  void onRead(String id, List<Reply<void>> replies) {
    _reads[id] = _Queue(replies);
  }

  List<int> get pagesRequested => [for (final c in pageCalls) c.page];

  @override
  Future<NotificationPage> fetchPage({
    required int page,
    int pageSize = 20,
    CancelToken? cancelToken,
  }) {
    pageCalls.add((page: page, pageSize: pageSize));
    final q = _pages[page];
    if (q == null) throw StateError('스크립트 없는 page $page');
    return _play(q.next(), cancelToken);
  }

  @override
  Future<NotificationDetail> fetchDetail(
    String notificationId, {
    CancelToken? cancelToken,
  }) {
    detailCalls.add(notificationId);
    final q = _details[notificationId];
    if (q == null) throw StateError('스크립트 없는 detail $notificationId');
    return _play(q.next(), cancelToken);
  }

  @override
  Future<void> markRead(String notificationId, {CancelToken? cancelToken}) {
    readCalls.add(notificationId);
    final q = _reads[notificationId];
    return _play(q == null ? defaultRead : q.next(), cancelToken);
  }
}

// ---------------------------------------------------------------------------
// 이동·미읽음 Fake
// ---------------------------------------------------------------------------

class FakeNotificationNavigator implements NotificationNavigator {
  /// `home:top`, `home`, `inbox`, `feed:{postId}:ai`, `feed:{postId}`, `detail:{id}`, `back-to-inbox`, `login`.
  final List<String> calls = [];
  final List<FeedTarget> feedTargets = [];

  int get count => calls.length;
  bool get isEmpty => calls.isEmpty;

  @override
  Future<void> openHome({required bool scrollToTopAndRefresh}) async {
    calls.add(scrollToTopAndRefresh ? 'home:top' : 'home');
  }

  @override
  Future<void> openInbox() async => calls.add('inbox');

  @override
  Future<void> openFeed(
    FeedTarget target, {
    required bool openAiFeedback,
  }) async {
    feedTargets.add(target);
    calls.add('feed:${target.postId}${openAiFeedback ? ':ai' : ''}');
  }

  @override
  Future<void> openNotificationDetail(String notificationId) async =>
      calls.add('detail:$notificationId');

  @override
  Future<void> backToInbox() async => calls.add('back-to-inbox');

  @override
  void goToLogin() => calls.add('login');
}

class FakeUnreadRefresher implements UnreadRefresher {
  int calls = 0;

  @override
  Future<void> refreshUnread() async => calls++;
}

/// 알림 읽음-이동 러너와 그 Fake들.
class TapRig {
  TapRig() {
    runner = NotificationTapRunner(
      repository: repo,
      navigator: nav,
      toast: toast,
      unread: unread,
      refreshInbox: () async => inboxRefreshes++,
    );
  }

  final FakeNotificationRepository repo = FakeNotificationRepository();
  final FakeNotificationNavigator nav = FakeNotificationNavigator();
  final RecordingToast toast = RecordingToast();
  final FakeUnreadRefresher unread = FakeUnreadRefresher();
  int inboxRefreshes = 0;
  late final NotificationTapRunner runner;
}

// ---------------------------------------------------------------------------
// 푸시 SDK 경계 Fake
// ---------------------------------------------------------------------------

class FakePushTokenProvider implements PushTokenProvider {
  FakePushTokenProvider([this.token]);

  String? token;
  int currentCalls = 0;
  final StreamController<String> _refreshed =
      StreamController<String>.broadcast();

  @override
  Future<String?> currentToken() async {
    currentCalls++;
    return token;
  }

  @override
  Stream<String> get tokenRefreshed => _refreshed.stream;

  void emitRefresh(String value) {
    token = value;
    _refreshed.add(value);
  }
}

/// 등록 요청을 기록한다. [replies]를 앞에서부터 하나씩 소비하고(없으면 성공), [gate]를 주면 첫 호출이 그때까지 기다린다.
class FakePushDeviceRepository implements PushDeviceRepository {
  final List<String> tokens = [];
  final List<Object?> replies = [];
  Completer<void>? gate;
  int maxInFlight = 0;
  int _inFlight = 0;

  int get calls => tokens.length;

  @override
  Future<void> register(String fcmToken) async {
    tokens.add(fcmToken);
    _inFlight++;
    if (_inFlight > maxInFlight) maxInFlight = _inFlight;
    try {
      final g = gate;
      if (g != null) await g.future;
      final next = replies.isEmpty ? null : replies.removeAt(0);
      if (next != null) throw next;
    } finally {
      _inFlight--;
    }
  }
}

class FakeSessionRefresher implements SessionRefresher {
  /// 앞에서부터 하나씩 소비한다. Session은 성공, null은 세션 없음, 그 밖은 던진다.
  final List<Object?> results = [];
  int calls = 0;

  @override
  Future<Session?> refresh() async {
    calls++;
    final next = results.isEmpty ? null : results.removeAt(0);
    if (next is Session?) return next;
    throw next;
  }
}

class FakeNotificationPermission implements NotificationPermission {
  FakeNotificationPermission([this.current = OsPermissionStatus.notDetermined]);

  OsPermissionStatus current;
  Object? requestError;
  int requests = 0;
  int statusCalls = 0;

  @override
  Future<OsPermissionStatus> status() async {
    statusCalls++;
    return current;
  }

  @override
  Future<OsPermissionStatus> request() async {
    requests++;
    final e = requestError;
    if (e != null) throw e;
    return current = OsPermissionStatus.granted;
  }
}

class FakePermissionFlag implements PermissionPromptFlag {
  FakePermissionFlag([this.requested = false]);

  bool requested;
  int marks = 0;

  @override
  Future<bool> isRequested() async => requested;

  @override
  Future<void> markRequested() async {
    marks++;
    requested = true;
  }
}

class FakePendingPushStore implements PendingPushStore {
  PendingPush? saved;
  int writes = 0;
  int clears = 0;

  @override
  Future<PendingPush?> read() async => saved;

  @override
  Future<void> write(PendingPush pending) async {
    writes++;
    saved = pending;
  }

  @override
  Future<void> clear() async {
    clears++;
    saved = null;
  }
}

class FakePushMessageSource implements PushMessageSource {
  final StreamController<PushMessage> _foreground =
      StreamController<PushMessage>.broadcast();
  final StreamController<PushMessage> _opened =
      StreamController<PushMessage>.broadcast();
  PushMessage? initial;
  int initialReads = 0;

  @override
  Stream<PushMessage> get foreground => _foreground.stream;

  @override
  Stream<PushMessage> get opened => _opened.stream;

  @override
  Future<PushMessage?> initialMessage() async {
    initialReads++;
    final value = initial;
    initial = null;
    return value;
  }

  void emitForeground(PushMessage m) => _foreground.add(m);
  void emitOpened(PushMessage m) => _opened.add(m);
}

class FakeLocalNotificationPresenter implements LocalNotificationPresenter {
  final List<({String channelId, String title, String body})> shown = [];
  final List<String?> payloads = [];

  @override
  Future<void> show({
    required String channelId,
    required String title,
    required String body,
    String? payload,
  }) async {
    shown.add((channelId: channelId, title: title, body: body));
    payloads.add(payload);
  }
}

// ---------------------------------------------------------------------------
// 화면 ViewModel 리그
// ---------------------------------------------------------------------------

/// 알림함 ViewModel과 Fake들. 러너의 `refreshInbox`는 ViewModel의 `reloadFirstPage`다.
class InboxRig {
  InboxRig() {
    runner = NotificationTapRunner(
      repository: repo,
      navigator: nav,
      toast: toast,
      unread: unread,
      refreshInbox: () => vm.reloadFirstPage(),
    );
    vm = NotificationInboxViewModel(
      repository: repo,
      runner: runner,
      toast: toast,
      analytics: analytics,
    );
    vm.events.listen(events.add);
  }

  final FakeNotificationRepository repo = FakeNotificationRepository();
  final FakeNotificationNavigator nav = FakeNotificationNavigator();
  final RecordingToast toast = RecordingToast();
  final FakeUnreadRefresher unread = FakeUnreadRefresher();
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();
  final List<InboxEvent> events = [];
  late final NotificationTapRunner runner;
  late final NotificationInboxViewModel vm;

  NotificationInboxState get state => vm.state;
  List<String> get ids => [for (final i in state.items) i.id];

  NotificationItem item(String id) => state.items.firstWhere((i) => i.id == id);
}

/// 알림 상세 ViewModel과 Fake들.
class DetailRig {
  DetailRig(this.id) {
    vm = NotificationDetailViewModel(
      notificationId: id,
      repository: repo,
      navigator: nav,
      unread: unread,
      refreshInbox: () async => inboxRefreshes++,
      analytics: analytics,
    );
  }

  final String id;
  final FakeNotificationRepository repo = FakeNotificationRepository();
  final FakeNotificationNavigator nav = FakeNotificationNavigator();
  final FakeUnreadRefresher unread = FakeUnreadRefresher();
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();
  int inboxRefreshes = 0;
  late final NotificationDetailViewModel vm;

  NotificationDetailState get state => vm.state;
}
