import 'package:chalkak/features/signature/domain/signature_drawing.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/onboarding_fakes.dart';

void main() {
  group('사인 유무 판정', () {
    test('TC-SIGN-001 획이 없는 새 사인은 사인 없음이다', () {
      expect(blankDrawing().hasSignature, isFalse);
      expect(blankDrawing().strokes, isEmpty);
    });

    test('TC-SIGN-002 점 하나만 찍어도 사인이 있는 것이다', () {
      final d = blankDrawing().startStroke(50, 60);
      expect(d.hasSignature, isTrue);
      expect(d.strokes, hasLength(1));
      expect(d.strokes.single.points, [const SignaturePoint(50, 60)]);
    });

    test('TC-SIGN-003 포인트가 없는 빈 획만 있으면 사인 없음이다', () {
      const d = SignatureDrawing(
        width: canvasW,
        height: canvasH,
        strokes: [SignatureStroke([])],
      );
      expect(d.hasSignature, isFalse);
    });

    test('TC-SIGN-003 빈 획과 점이 있는 획이 섞이면 사인이 있다', () {
      const d = SignatureDrawing(
        width: canvasW,
        height: canvasH,
        strokes: [
          SignatureStroke([]),
          SignatureStroke([SignaturePoint(1, 1)]),
        ],
      );
      expect(d.hasSignature, isTrue);
    });

    test('TC-SIGN-004 포인트가 있는 획은 사인이 있는 것으로 취급한다', () {
      expect(sampleDrawing().hasSignature, isTrue);
    });
  });

  group('획 기록', () {
    test('TC-SIGN-004 startStroke 뒤 addPoint는 같은 획에 이어진다', () {
      final d = blankDrawing().startStroke(10, 10).addPoint(20, 20);
      expect(d.strokes, hasLength(1));
      expect(d.strokes.single.points, hasLength(2));
    });

    test('TC-SIGN-004 startStroke를 다시 부르면 새 획이다(여러 획)', () {
      final d = blankDrawing()
          .startStroke(10, 10)
          .addPoint(20, 20)
          .startStroke(100, 100)
          .addPoint(110, 110);
      expect(d.strokes, hasLength(2));
      expect(d.strokes[0].points.first, const SignaturePoint(10, 10));
      expect(d.strokes[1].points.first, const SignaturePoint(100, 100));
    });

    test('TC-SIGN-004 변경 메서드는 원본을 바꾸지 않는다(불변)', () {
      final a = blankDrawing().startStroke(10, 10);
      final b = a.addPoint(20, 20);
      expect(a.strokes.single.points, hasLength(1));
      expect(b.strokes.single.points, hasLength(2));
    });

    test('TC-SIGN-004 획이 없을 때 addPoint는 새 획을 시작한다', () {
      final d = blankDrawing().addPoint(5, 5);
      expect(d.strokes, hasLength(1));
      expect(d.hasSignature, isTrue);
    });
  });

  group('좌표 보정', () {
    test('TC-SIGN-005 음수 좌표는 0으로 보정된다', () {
      final d = blankDrawing().startStroke(-30, -1).addPoint(-0.5, 10);
      expect(d.strokes.single.points, const [
        SignaturePoint(0, 0),
        SignaturePoint(0, 10),
      ]);
    });

    test('TC-SIGN-005 캔버스를 넘는 좌표는 가장자리로 보정된다', () {
      final d = blankDrawing()
          .startStroke(canvasW + 50, canvasH + 1)
          .addPoint(canvasW + 0.5, 20);
      expect(d.strokes.single.points, const [
        SignaturePoint(canvasW, canvasH),
        SignaturePoint(canvasW, 20),
      ]);
    });

    test('TC-SIGN-005 경계 위의 좌표는 그대로 둔다', () {
      final d = blankDrawing().startStroke(0, 0).addPoint(canvasW, canvasH);
      expect(d.strokes.single.points, const [
        SignaturePoint(0, 0),
        SignaturePoint(canvasW, canvasH),
      ]);
    });
  });

  test('TC-SIGN-005 withCanvas는 획을 유지하고 새 크기로 이후 좌표를 보정한다', () {
    final d = sampleDrawing().withCanvas(100, 50);
    expect(d.strokes, hasLength(1));
    expect(d.width, 100);
    expect(d.height, 50);
    final next = d.startStroke(500, 500);
    expect(next.strokes.last.points.single, const SignaturePoint(100, 50));
  });

  group('되돌리기·전체 지우기', () {
    SignatureDrawing three() => strokesOf([
      [(10, 10), (20, 20)],
      [(30, 30)],
      [(40, 40), (50, 50), (60, 60)],
    ]);

    test('TC-SIGN-006 되돌리기 3회로 마지막 획부터 하나씩 사라지고 0개가 된다', () {
      var d = three();
      expect(d.strokes, hasLength(3));
      d = d.undo();
      expect(d.strokes, hasLength(2));
      expect(d.strokes.last.points.first, const SignaturePoint(30, 30));
      d = d.undo();
      expect(d.strokes, hasLength(1));
      expect(d.strokes.single.points.first, const SignaturePoint(10, 10));
      d = d.undo();
      expect(d.strokes, isEmpty);
      expect(d.hasSignature, isFalse);
    });

    test('TC-SIGN-006 획이 없을 때 되돌리기는 아무 일도 하지 않는다', () {
      final d = blankDrawing().undo();
      expect(d.strokes, isEmpty);
    });

    test('TC-SIGN-007 전체 지우기는 획을 0개로 만들고 이어서 새로 그릴 수 있다', () {
      final cleared = three().clear();
      expect(cleared.strokes, isEmpty);
      expect(cleared.hasSignature, isFalse);
      final again = cleared.startStroke(1, 2);
      expect(again.hasSignature, isTrue);
      expect(again.strokes, hasLength(1));
    });

    test('TC-SIGN-007 캔버스 크기는 지운 뒤에도 유지된다', () {
      final cleared = three().clear();
      expect(cleared.width, canvasW);
      expect(cleared.height, canvasH);
      expect(three().empty.strokes, isEmpty);
      expect(three().empty.width, canvasW);
    });
  });
}
