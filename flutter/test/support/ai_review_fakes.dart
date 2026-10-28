import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/ai_review/data/api_ai_review_repository.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_session.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_state.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_target.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'auth_fakes.dart';
import 'fake_adapter.dart';
import 'home_fakes.dart' show RecordingToast, fx;
import 'net_harness.dart' show advance, sessionAt, t0, v1;
import 'ui_helpers.dart' show pumpScreen;

export 'home_fakes.dart' show RecordingToast, failing, fx;

/// 내 오늘 게시물(fixture 경로의 postId)과 다른 게시물.
const aiPostA = '22222222-2222-4222-8222-222222222201';
const aiPostB = '22222222-2222-4222-8222-222222222202';

/// `ai-review/ai-review-get__<name>.json`.
String aiGet(String name) => 'ai-review/ai-review-get__$name.json';

/// `ai-review/ai-review-post__<name>.json`.
String aiPost(String name) => 'ai-review/ai-review-post__$name.json';

String aiPath(String postId) => '$v1/posts/$postId/ai-review';

class _Seq {
  _Seq(this.responses);
  final List<FakeResponse> responses;
  int calls = 0;

  FakeResponse next() {
    final i = calls++;
    return responses[i < responses.length ? i : responses.length - 1];
  }
}

/// AI 피드백 엔드포인트를 [FakeAdapter]에 스크립트한다. 게시물(A, B)마다 GET·POST 응답 열을 걸고
/// 마지막 응답이 반복된다. 스크립트 안 한 GET은 NONE, POST는 202 PROCESSING으로 답한다.
class AiApi {
  AiApi(this.adapter) {
    for (final id in [aiPostA, aiPostB]) {
      adapter.onDynamic('GET', aiPath(id), (r) => _gets[id]!.next());
      adapter.onDynamic('POST', aiPath(id), (r) => _posts[id]!.next());
    }
  }

  final FakeAdapter adapter;
  final Map<String, _Seq> _gets = {
    aiPostA: _Seq([fx(aiGet('none'))]),
    aiPostB: _Seq([fx(aiGet('none'))]),
  };
  final Map<String, _Seq> _posts = {
    aiPostA: _Seq([fx(aiPost('202-processing'))]),
    aiPostB: _Seq([fx(aiPost('202-processing'))]),
  };

  void get(List<FakeResponse> responses, {String postId = aiPostA}) =>
      _gets[postId] = _Seq(responses);

  void post(List<FakeResponse> responses, {String postId = aiPostA}) =>
      _posts[postId] = _Seq(responses);

  int getCalls([String postId = aiPostA]) =>
      adapter.count('GET', aiPath(postId));

  int postCalls([String postId = aiPostA]) =>
      adapter.count('POST', aiPath(postId));

  /// 전체 요청 수(남의 게시물·게스트의 "API 0건" 확인용).
  int get totalCalls => adapter.requests.length;

  /// GET이 어댑터에 도착한 시각(가상 시작 [t0] 기준 경과).
  List<Duration> getOffsets([String postId = aiPostA]) => [
    for (final r in adapter.where('GET', aiPath(postId))) r.at.difference(t0),
  ];

  List<Duration> postOffsets([String postId = aiPostA]) => [
    for (final r in adapter.where('POST', aiPath(postId))) r.at.difference(t0),
  ];
}

/// AI 피드백 세션 테스트 한 벌: 실제 [ApiAiReviewRepository]를 FakeAdapter 위에 얹는다.
/// 가상 시계(`fakeTest`/`fakeTestAt`) 안에서 만든다. 가상 시작 시각 [t0] = KST 2026-10-27 12:00.
class AiRig {
  AiRig({
    AiReviewSurface surface = AiReviewSurface.feed,
    bool openSheetOnEntry = false,
    Session? authSession,
  }) : http = AuthHttpHarness(session: authSession ?? sessionAt()) {
    repository = ApiAiReviewRepository(client: http.client);
    api = AiApi(http.adapter);
    session = AiReviewSession(
      repository: repository,
      toast: toast,
      surface: surface,
      openSheetOnEntry: openSheetOnEntry,
    );
    session.addListener(() => states.add(session.state));
  }

  /// 오늘 주제의 내 게시물.
  static const today = KstDate(2026, 10, 27);
  static const yesterday = KstDate(2026, 10, 26);

  final AuthHttpHarness http;
  late final ApiAiReviewRepository repository;
  late final AiApi api;
  late final AiReviewSession session;
  final RecordingToast toast = RecordingToast();
  final List<AiReviewState> states = [];

  AiReviewState get state => session.state;

  AiReviewTarget get target =>
      const AiReviewTarget(postId: aiPostA, topicDate: today);

  AiReviewTarget get pastTarget =>
      const AiReviewTarget(postId: aiPostA, topicDate: yesterday);

  AiReviewTarget get targetB =>
      const AiReviewTarget(postId: aiPostB, topicDate: today);

  /// 대상을 정하고 화면을 보여 모든 응답을 소화한다.
  void show(
    FakeAsync async, {
    AiReviewTarget? target,
    Duration wait = const Duration(seconds: 1),
  }) {
    session.setTarget(target ?? this.target);
    session.onShown();
    advance(async, wait);
  }

  /// 가상 시간을 흘려 진행 중인 응답과 타이머를 소화한다.
  void pass(FakeAsync async, [Duration d = const Duration(seconds: 1)]) =>
      advance(async, d);

  /// 시작 시트를 열고 "분석 시작하기"까지 누른다.
  void request(FakeAsync async, {Duration wait = Duration.zero}) {
    session.onPillPressed();
    session.onStartConfirmed();
    advance(async, wait);
  }
}

/// 위젯 하나를 세션과 함께 띄운다. 대상을 먼저 정하므로 위젯이 붙는 순간 첫 GET이 나간다.
/// 시트가 열릴 수 있도록 Scaffold 안에 둔다.
Future<void> pumpAiWidget(
  WidgetTester tester,
  AiRig rig,
  Widget Function(AiReviewSession session) build, {
  AiReviewTarget? target,
}) async {
  addTearDown(rig.session.dispose);
  rig.session.setTarget(target ?? rig.target);
  await pumpScreen(
    tester,
    Scaffold(
      body: Align(alignment: Alignment.topLeft, child: build(rig.session)),
    ),
  );
}

/// 시트 열림·닫힘 애니메이션이 끝나도록 시간을 흘린다.
Future<void> settleSheet(WidgetTester tester) =>
    tester.pump(const Duration(milliseconds: 600));
