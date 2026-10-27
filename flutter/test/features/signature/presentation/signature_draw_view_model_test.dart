import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/signature/domain/signature_mode.dart';
import 'package:chalkak/features/signature/presentation/signature_draw_view_model.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_analytics_tracker.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show settle;
import '../../../support/onboarding_fakes.dart';

class _Rig {
  _Rig({
    SignatureMode mode = SignatureMode.onboarding,
    FakeSignatureRenderer? r,
  }) : renderer = r ?? FakeSignatureRenderer() {
    vm = SignatureDrawViewModel(
      mode: mode,
      renderer: renderer,
      analytics: analytics,
      canvasWidth: canvasW,
      canvasHeight: canvasH,
    );
    vm.events.listen(events.add);
  }

  final FakeSignatureRenderer renderer;
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();
  final List<SignatureDrawEvent> events = [];
  late final SignatureDrawViewModel vm;

  SignatureDrawState get state => vm.state;

  void stroke(List<(double, double)> points) {
    vm.onStrokeStart(points.first.$1, points.first.$2);
    for (final p in points.skip(1)) {
      vm.onStrokeUpdate(p.$1, p.$2);
    }
    vm.onStrokeEnd();
  }

  void drawSample() => stroke([(10, 10), (50, 60), (90, 20)]);

  void confirm(FakeAsync async) {
    vm.onConfirmPressed();
    settle(async);
  }
}

void main() {
  group('버튼 활성 조건', () {
    fakeTest('TC-SIGN-001 획이 없으면 되돌리기·전체 지우기·확정이 모두 비활성이다', (async) {
      final r = _Rig();
      expect(r.state.canUndo, isFalse);
      expect(r.state.canClear, isFalse);
      expect(r.state.canConfirm, isFalse);
      expect(r.state.error, isNull);
    });

    fakeTest('TC-SIGN-004 획이 생기면 세 버튼이 모두 활성이다', (async) {
      final r = _Rig()..drawSample();
      expect(r.state.canUndo, isTrue);
      expect(r.state.canClear, isTrue);
      expect(r.state.canConfirm, isTrue);
    });

    fakeTest('TC-SIGN-002 점 하나만 찍어도 확정이 활성이다', (async) {
      final r = _Rig();
      r.vm.onStrokeStart(30, 30);
      r.vm.onStrokeEnd();
      expect(r.state.canConfirm, isTrue);
      expect(r.state.drawing.strokes, hasLength(1));
    });

    fakeTest('TC-SIGN-005 캔버스 밖 좌표는 보정되어 기록된다', (async) {
      final r = _Rig();
      r.vm.onStrokeStart(-20, canvasH + 30);
      r.vm.onStrokeUpdate(canvasW + 10, -5);
      final pts = r.state.drawing.strokes.single.points;
      expect(pts.first.x, 0);
      expect(pts.first.y, canvasH);
      expect(pts.last.x, canvasW);
      expect(pts.last.y, 0);
    });

    fakeTest('TC-SIGN-005 실제 그리기 영역 크기가 정해지면 그 영역으로 좌표를 보정한다', (async) {
      final r = _Rig();
      r.vm.onCanvasSizeChanged(100, 50);
      r.vm.onStrokeStart(300, 300);
      final p = r.state.drawing.strokes.single.points.single;
      expect(p.x, 100);
      expect(p.y, 50);
    });

    fakeTest('TC-SIGN-005 영역이 바뀌어도 이미 그린 획은 유지된다', (async) {
      final r = _Rig()..drawSample();
      r.vm.onCanvasSizeChanged(500, 250);
      expect(r.state.drawing.strokes, hasLength(1));
      expect(r.state.drawing.width, 500);
      expect(r.state.drawing.height, 250);
    });

    fakeTest('TC-SIGN-004 그리는 동안 화면이 갱신되도록 알린다', (async) {
      final r = _Rig();
      var notified = 0;
      r.vm.addListener(() => notified++);
      r.vm.onStrokeStart(1, 1);
      r.vm.onStrokeUpdate(2, 2);
      expect(notified, greaterThanOrEqualTo(2));
    });
  });

  group('되돌리기·전체 지우기', () {
    fakeTest('TC-SIGN-006 획 3개를 되돌리기 3회로 지우면 확정과 되돌리기가 비활성이다', (async) {
      final r = _Rig();
      r.stroke([(10, 10), (20, 20)]);
      r.stroke([(30, 30), (40, 40)]);
      r.stroke([(50, 50), (60, 60)]);
      expect(r.state.drawing.strokes, hasLength(3));
      r.vm.undo();
      expect(r.state.drawing.strokes, hasLength(2));
      r.vm.undo();
      expect(r.state.drawing.strokes, hasLength(1));
      r.vm.undo();
      expect(r.state.drawing.strokes, isEmpty);
      expect(r.state.canUndo, isFalse);
      expect(r.state.canConfirm, isFalse);
    });

    fakeTest('TC-SIGN-007 전체 지우기는 획을 0개로 만들고 이어서 새로 그릴 수 있다', (async) {
      final r = _Rig();
      r.drawSample();
      r.drawSample();
      r.vm.clear();
      expect(r.state.drawing.strokes, isEmpty);
      expect(r.state.canConfirm, isFalse);
      expect(r.state.canClear, isFalse);
      r.drawSample();
      expect(r.state.canConfirm, isTrue);
    });

    fakeTest('TC-SIGN-007 획이 없을 때 되돌리기·지우기는 무시된다', (async) {
      final r = _Rig();
      r.vm.undo();
      r.vm.clear();
      expect(r.state.drawing.strokes, isEmpty);
      expect(r.events, isEmpty);
    });
  });

  group('확정', () {
    fakeTest('TC-SIGN-008 확정하면 렌더링한 PNG로 미리보기 이벤트를 한 번 낸다', (async) {
      final r = _Rig()..drawSample();
      r.confirm(async);
      expect(r.renderer.calls, 1);
      expect(r.renderer.rendered.single.strokes, hasLength(1));
      expect(r.events, hasLength(1));
      final e = r.events.single as NavigateToPreview;
      expect(e.png, r.renderer.png);
    });

    fakeTest('TC-SIGN-008 확정을 연타해도 미리보기는 한 번만 열린다', (async) {
      final r = _Rig()..drawSample();
      for (var i = 0; i < 3; i++) {
        r.vm.onConfirmPressed();
      }
      settle(async);
      r.vm.onConfirmPressed();
      settle(async);
      expect(r.renderer.calls, 1);
      expect(r.events.whereType<NavigateToPreview>(), hasLength(1));
    });

    fakeTest('TC-SIGN-008 렌더링 중에는 확정이 비활성이고 끝나면 이벤트를 낸다', (async) {
      final renderer = FakeSignatureRenderer()..gate = Completer<void>();
      final r = _Rig(r: renderer)..drawSample();
      r.vm.onConfirmPressed();
      settle(async);
      expect(r.state.isRendering, isTrue);
      expect(r.state.canConfirm, isFalse);
      expect(r.events, isEmpty);
      renderer.gate!.complete();
      settle(async);
      expect(r.state.isRendering, isFalse);
      expect(r.events, hasLength(1));
    });

    fakeTest('TC-SIGN-008 reset 뒤에는 다시 확정할 수 있고 그림은 유지된다', (async) {
      final r = _Rig()..drawSample();
      r.confirm(async);
      r.vm.reset();
      expect(r.state.drawing.hasSignature, isTrue);
      r.confirm(async);
      expect(r.events.whereType<NavigateToPreview>(), hasLength(2));
    });

    fakeTest('TC-SIGN-001 획이 없으면 확정해도 렌더링하지 않는다', (async) {
      final r = _Rig();
      r.confirm(async);
      expect(r.renderer.calls, 0);
      expect(r.events, isEmpty);
    });

    fakeTest('TC-SIGN-014 정확히 1,048,576바이트 PNG는 미리보기로 간다', (async) {
      final renderer = FakeSignatureRenderer(fakePng(1048576));
      final r = _Rig(r: renderer)..drawSample();
      r.confirm(async);
      expect(r.events.single, isA<NavigateToPreview>());
      expect(r.state.error, isNull);
    });

    fakeTest(
      'TC-SIGN-015 1,048,577바이트 PNG는 이벤트 없이 too-large 오류를 보이고 그림을 유지한다',
      (async) {
        final renderer = FakeSignatureRenderer(fakePng(1048577));
        final r = _Rig(r: renderer)..drawSample();
        r.confirm(async);
        expect(r.events, isEmpty);
        expect(r.state.error!.text, Copy.signErrorTooLarge);
        expect(r.state.drawing.hasSignature, isTrue);
        expect(r.state.canConfirm, isTrue);
      },
    );

    fakeTest('TC-SIGN-015 오류는 같은 문구가 연달아 나와도 id가 달라 다시 표시된다', (async) {
      final renderer = FakeSignatureRenderer(fakePng(1048577));
      final r = _Rig(r: renderer)..drawSample();
      r.confirm(async);
      final first = r.state.error!.id;
      r.confirm(async);
      expect(r.state.error!.text, Copy.signErrorTooLarge);
      expect(r.state.error!.id, isNot(first));
    });

    fakeTest('TC-SIGN-015 다음 그리기 동작이 오류를 지운다', (async) {
      final renderer = FakeSignatureRenderer(fakePng(1048577));
      final r = _Rig(r: renderer)..drawSample();
      r.confirm(async);
      expect(r.state.error, isNotNull);
      r.vm.onStrokeStart(5, 5);
      expect(r.state.error, isNull);
    });

    fakeTest('TC-SIGN-015 렌더러가 실패하면 이벤트 없이 모드별 일반 오류를 보이고 그림을 유지한다', (async) {
      final onboarding = _Rig(
        r: FakeSignatureRenderer()..error = StateError('x'),
      )..drawSample();
      onboarding.confirm(async);
      expect(onboarding.events, isEmpty);
      expect(onboarding.state.error!.text, Copy.onbSignupErrorGeneric);
      expect(onboarding.state.drawing.hasSignature, isTrue);

      final change = _Rig(
        mode: SignatureMode.change,
        r: FakeSignatureRenderer()..error = StateError('x'),
      )..drawSample();
      change.confirm(async);
      expect(change.state.error!.text, Copy.signChangeErrorGeneric);
    });

    fakeTest('TC-SIGN-029 서버 거절로 돌아오면 showError로 문구를 띄우고 그림은 유지한다', (async) {
      final r = _Rig()..drawSample();
      r.vm.showError(Copy.signErrorInvalid);
      expect(r.state.error!.text, Copy.signErrorInvalid);
      expect(r.state.drawing.hasSignature, isTrue);
    });
  });

  group('뒤로 가기·분석', () {
    fakeTest('TC-SIGN-042 뒤로 가면 이동 이벤트만 내고 렌더링·그림 변경이 없다', (async) {
      final r = _Rig(mode: SignatureMode.change)..drawSample();
      r.vm.onBackPressed();
      settle(async);
      expect(r.events.single, isA<NavigateBackFromDrawing>());
      expect(r.renderer.calls, 0);
    });

    fakeTest('TC-ONB-049 가입 모드는 onboarding_signature를 한 번만 보낸다', (async) {
      final r = _Rig();
      r.vm.onShown();
      r.vm.onShown();
      expect(r.analytics.screenNames, ['onboarding_signature']);
    });

    fakeTest('TC-SIGN-043 변경 모드는 change_signature를 한 번만 보낸다', (async) {
      final r = _Rig(mode: SignatureMode.change);
      r.vm.onShown();
      r.vm.onShown();
      expect(r.analytics.screenNames, ['change_signature']);
    });
  });
}
