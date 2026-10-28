import 'dart:async';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/features/feedback/data/api_feedback_repository.dart';
import 'package:chalkak/features/feedback/domain/feedback_repository.dart';
import 'package:chalkak/features/feedback/presentation/feedback_view_model.dart';
import 'package:dio/dio.dart';
import 'package:fake_async/fake_async.dart';

import 'auth_fakes.dart';
import 'fake_adapter.dart' show FakeResponse;
import 'fake_analytics_tracker.dart';
import 'home_fakes.dart' show RecordingToast;
import 'net_harness.dart' show advance, sessionAt, v1;

export 'home_fakes.dart' show RecordingToast, fx;

const feedbacksPath = '$v1/feedbacks';

/// 서버 대신 스크립트로 답하는 저장소(위젯 테스트용). [gate]를 지정하면 그 Future가 끝날 때까지 기다린다.
class FakeFeedbackRepository implements FeedbackRepository {
  final List<String> sent = [];
  Object? error;
  Completer<void>? gate;

  int get calls => sent.length;

  @override
  Future<FeedbackReceipt> send(
    String content, {
    CancelToken? cancelToken,
  }) async {
    sent.add(content);
    final g = gate;
    if (g != null) await g.future;
    final e = error;
    if (e != null) throw e;
    return FeedbackReceipt(
      feedbackId: '12121212-1212-4121-8121-121212121201',
      createdAt: DateTime.utc(2026, 10, 27, 3),
    );
  }
}

/// 피드백 한 벌: 실제 `ApiClient` + FakeAdapter 위의 [ApiFeedbackRepository]와 [FeedbackViewModel].
class FeedbackRig {
  FeedbackRig({Session? session, FeedbackRepository? repository})
    : http = AuthHttpHarness(session: session ?? sessionAt()) {
    api = ApiFeedbackRepository(client: http.client);
    vm = FeedbackViewModel(
      repository: repository ?? api,
      sessions: http.sessions,
      toast: toast,
      analytics: analytics,
      onComposingChanged: composing.add,
    );
    vm.events.listen(events.add);
  }

  final AuthHttpHarness http;
  late final ApiFeedbackRepository api;
  late final FeedbackViewModel vm;
  final RecordingToast toast = RecordingToast();
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();
  final List<FeedbackEvent> events = [];
  final List<bool> composing = [];

  FeedbackState get state => vm.state;

  /// `POST /feedbacks` 응답 열(마지막이 반복된다).
  void onPost(List<FakeResponse> responses) =>
      http.adapter.on('POST', feedbacksPath, responses);

  int get posts => http.adapter.count('POST', feedbacksPath);

  /// 입력하고 보낸 뒤 가상 시간을 [wait]만큼 흘린다.
  void sendText(FakeAsync async, String text, [Duration wait = Duration.zero]) {
    vm.onTextChanged(text);
    vm.send();
    advance(async, wait);
  }
}

String repeat(String unit, int times) => List.filled(times, unit).join();

/// 결합 이모지 👨‍👩‍👧 (code point 5개).
const familyEmoji = '\u{1F468}‍\u{1F469}‍\u{1F467}';
