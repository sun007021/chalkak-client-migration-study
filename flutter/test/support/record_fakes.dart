import 'dart:async';
import 'dart:typed_data';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/record/data/api_record_repository.dart';
import 'package:chalkak/features/record/domain/record_calendar_image.dart';
import 'package:chalkak/features/record/domain/record_post_events.dart';
import 'package:chalkak/features/record/domain/record_state.dart';
import 'package:chalkak/features/record/domain/record_view_model.dart';
import 'package:fake_async/fake_async.dart';

import 'auth_fakes.dart';
import 'fake_adapter.dart';
import 'home_fakes.dart' show RecordingToast, fx;
import 'net_harness.dart' show advance, sessionAt, t0, v1;

export 'home_fakes.dart' show RecordingToast, failing, fx;

class _Seq {
  _Seq(this.responses);
  final List<FakeResponse> responses;
  int calls = 0;

  FakeResponse next() {
    final i = calls++;
    return responses[i < responses.length ? i : responses.length - 1];
  }
}

/// 기록 관련 엔드포인트를 [FakeAdapter]에 스크립트한다. 달마다 응답 열을 걸고 마지막 응답이
/// 반복된다. 스크립트 안 한 달은 200 빈 달로 답한다.
class RecordApi {
  RecordApi(this.adapter) {
    adapter.onDynamic(
      'GET',
      '$v1/posts/calendar/months',
      (r) => _months.next(),
    );
    adapter.onDynamic('GET', '$v1/posts/calendar', (r) {
      final q = r.uri.queryParameters;
      final key = '${q['year']}-${q['month']}';
      final script = _calendar[key];
      if (script == null) {
        return FakeResponse.json(200, {
          'year': int.tryParse(q['year'] ?? '') ?? 0,
          'month': int.tryParse(q['month'] ?? '') ?? 0,
          'posts': <Object>[],
        });
      }
      return script.next();
    });
  }

  final FakeAdapter adapter;
  _Seq _months = _Seq([fx('record/posts-calendar-months__recent-first.json')]);
  final Map<String, _Seq> _calendar = {};

  /// 월 목록 응답 열.
  void months(List<FakeResponse> responses) => _months = _Seq(responses);

  void calendar(int year, int month, List<FakeResponse> responses) =>
      _calendar['$year-$month'] = _Seq(responses);

  /// FIXTURE_NOW(KST 2026-10-27 화) 기준 정상 시나리오: 월 목록 [2026-10, 2026-09],
  /// 10월(10/20 승인, 10/27 반영 중, 10/31 승인), 9월(9/17, 9/30 승인).
  void standard({Duration delay = Duration.zero}) {
    months([fx('record/posts-calendar-months__recent-first.json')]);
    calendar(2026, 10, [
      fx('record/posts-calendar__2026-10.json', delay: delay),
    ]);
    calendar(2026, 9, [
      fx('record/posts-calendar__2026-09.json', delay: delay),
    ]);
  }

  // 호출 집계
  int get monthsCalls => adapter.count('GET', '$v1/posts/calendar/months');
  int get calendarCalls => adapter.count('GET', '$v1/posts/calendar');

  /// 'yyyy-M' 형태(쿼리 그대로) 요청 순서.
  List<String> get calendarRequested => [
    for (final r in adapter.where('GET', '$v1/posts/calendar'))
      '${r.uri.queryParameters['year']}-${r.uri.queryParameters['month']}',
  ];

  int calendarCallsFor(int year, int month) =>
      calendarRequested.where((k) => k == '$year-$month').length;

  /// 기록 API 밖으로 나간 요청까지 포함한 전체 수(게스트 "API 0건" 확인용).
  int get totalCalls => adapter.requests.length;

  /// 상세 API(`GET /posts/{id}`) 호출 수. PENDING 선택이 상세를 부르지 않음을 확인한다.
  int get postDetailCalls => adapter.requests
      .where(
        (r) =>
            r.method == 'GET' &&
            RegExp(r'^/api/v1/posts/[0-9a-f-]{36}$').hasMatch(r.path),
      )
      .length;
}

/// 삭제 이벤트를 직접 흘리는 Fake.
class FakeRecordPostEvents implements RecordPostEvents {
  final StreamController<String> _controller =
      StreamController<String>.broadcast(sync: true);

  void remove(String postId) => _controller.add(postId);

  @override
  Stream<String> get removedPostIds => _controller.stream;
}

/// 렌더 요청을 기록하고 PNG 시그니처로 시작하는 바이트를 돌려준다.
class FakeCalendarImageRenderer implements CalendarImageRenderer {
  final List<RecordCalendarImageSpec> specs = [];
  Completer<void>? gate;
  Object? error;

  static final Uint8List fakePng = Uint8List.fromList([
    0x89,
    0x50,
    0x4E,
    0x47,
    0x0D,
    0x0A,
    0x1A,
    0x0A,
  ]);

  @override
  Future<Uint8List> render(RecordCalendarImageSpec spec) async {
    specs.add(spec);
    final g = gate;
    if (g != null) await g.future;
    final e = error;
    if (e != null) throw e;
    return fakePng;
  }
}

/// 저장 요청을 기록하는 Fake. [error]를 지정하면 던진다.
class FakeCalendarImageSaver implements CalendarImageSaver {
  final List<String> fileNames = [];
  final List<Uint8List> saved = [];
  Completer<void>? gate;
  Object? error;

  int get calls => fileNames.length;

  @override
  Future<void> save({
    required String fileName,
    required Uint8List pngBytes,
  }) async {
    fileNames.add(fileName);
    saved.add(pngBytes);
    final g = gate;
    if (g != null) await g.future;
    final e = error;
    if (e != null) throw e;
  }
}

/// 기록 ViewModel 테스트 한 벌: 실제 [ApiRecordRepository]를 FakeAdapter 위에 얹는다.
/// `api.standard()`가 이미 걸려 있으므로 테스트는 바꿀 응답만 다시 건다.
/// [now]는 가상 시계 시작 시각(세션 만료 계산 기준)이며 `fakeTest`/`fakeTestAt` 안에서 만든다.
class RecordRig {
  RecordRig({DateTime? now, Session? session})
    : http = AuthHttpHarness(session: session ?? sessionAt(now: now ?? t0)) {
    repository = ApiRecordRepository(client: http.client);
    api = RecordApi(http.adapter)..standard();
  }

  final AuthHttpHarness http;
  late final ApiRecordRepository repository;
  late final RecordApi api;
  final RecordingToast toast = RecordingToast();
  final FakeRecordPostEvents postEvents = FakeRecordPostEvents();
  final FakeCalendarImageRenderer renderer = FakeCalendarImageRenderer();
  final FakeCalendarImageSaver saver = FakeCalendarImageSaver();
  final List<RecordEvent> events = [];
  final List<RecordState> states = [];

  late final RecordViewModel vm = _makeVm();

  RecordViewModel _makeVm() {
    final vm = RecordViewModel(
      repository: repository,
      postEvents: postEvents,
      imageRenderer: renderer,
      imageSaver: saver,
      toast: toast,
    );
    vm.events.listen(events.add);
    vm.addListener(() => states.add(vm.state));
    return vm;
  }

  RecordState get state => vm.state;

  /// 화면에 들어와 모든 응답을 소화한다.
  void enter(
    FakeAsync async, {
    KstDate? requestedDate,
    Duration wait = const Duration(seconds: 5),
  }) {
    vm.enter(requestedDate: requestedDate);
    advance(async, wait);
  }

  /// 가상 시간을 흘려 진행 중인 응답을 소화한다.
  void pass(FakeAsync async, [Duration d = const Duration(seconds: 5)]) =>
      advance(async, d);
}

/// 날짜 표기 단축.
KstDate d(int y, int m, int day) => KstDate(y, m, day);

/// 내용 상태가 [RecordReady]일 때 사진 postId 끝 두 글자(fixture의 id 구분용) 목록.
List<String> photoIds(RecordState s) {
  final c = s.content;
  return c is RecordReady
      ? [for (final p in c.photos) p.postId.substring(34)]
      : const [];
}

/// 이 repo의 fixture postId.
const postOct20 = '22222222-2222-4222-8222-222222222290';
const postOct27Pending = '22222222-2222-4222-8222-222222222201';
const postOct31 = '22222222-2222-4222-8222-222222222291';
const postSep17 = '22222222-2222-4222-8222-222222222297';
const postSep30 = '22222222-2222-4222-8222-222222222296';
