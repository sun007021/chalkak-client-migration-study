import 'dart:math' as math;

import 'package:chalkak/core/constants/app_constants.dart';
import 'package:chalkak/features/signature/domain/signature_drawing.dart';
import 'package:chalkak/features/signature/domain/signature_geometry.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/onboarding_fakes.dart';

const _w = AppConstants.signaturePngWidth;
const _h = AppConstants.signaturePngHeight;
const _pad = AppConstants.signaturePadding;

List<List<SignaturePoint>> _layout(SignatureDrawing d) =>
    SignatureGeometry.layout(d, width: _w, height: _h, padding: _pad);

({double minX, double maxX, double minY, double maxY}) _bounds(
  List<List<SignaturePoint>> strokes,
) {
  final pts = strokes.expand((s) => s).toList();
  return (
    minX: pts.map((p) => p.x).reduce(math.min),
    maxX: pts.map((p) => p.x).reduce(math.max),
    minY: pts.map((p) => p.y).reduce(math.min),
    maxY: pts.map((p) => p.y).reduce(math.max),
  );
}

void main() {
  const eps = 0.5;
  const left = _pad;
  const right = _w - _pad;
  const top = _pad;
  const bottom = _h - _pad;

  test('TC-SIGN-011 사인이 없으면 빈 목록이다', () {
    expect(_layout(blankDrawing()), isEmpty);
  });

  test('TC-SIGN-011 한쪽 모서리에 몰린 획도 패딩 48px 안쪽 영역에 맞춰진다', () {
    final d = strokeOf([(0, 0), (40, 20), (80, 10)]);
    final b = _bounds(_layout(d));
    expect(b.minX, greaterThanOrEqualTo(left - eps));
    expect(b.maxX, lessThanOrEqualTo(right + eps));
    expect(b.minY, greaterThanOrEqualTo(top - eps));
    expect(b.maxY, lessThanOrEqualTo(bottom + eps));
  });

  test('TC-SIGN-011 외곽 박스는 비율을 유지한 채 영역을 최대한 채우고 중앙 정렬된다', () {
    // 4:1 비율의 박스(가로가 더 길다) -> 가로는 영역을 꽉 채우고 세로는 위아래로 남는다.
    final d = strokeOf([(100, 90), (300, 140)]);
    final b = _bounds(_layout(d));
    expect(b.minX, closeTo(left, eps));
    expect(b.maxX, closeTo(right, eps));
    final ratio = (b.maxX - b.minX) / (b.maxY - b.minY);
    expect(ratio, closeTo(200 / 50, 0.05));
    expect((b.minY + b.maxY) / 2, closeTo(_h / 2, eps));
  });

  test('TC-SIGN-011 세로로 긴 박스는 세로를 꽉 채우고 가로로 중앙 정렬된다', () {
    final d = strokeOf([(190, 10), (210, 190)]);
    final b = _bounds(_layout(d));
    expect(b.minY, closeTo(top, eps));
    expect(b.maxY, closeTo(bottom, eps));
    expect((b.minX + b.maxX) / 2, closeTo(_w / 2, eps));
  });

  test('TC-SIGN-011 획이 여러 개여도 전체 외곽 박스 기준으로 맞춰진다', () {
    final d = strokesOf([
      [(20, 20), (60, 60)],
      [(300, 150), (380, 180)],
    ]);
    final strokes = _layout(d);
    expect(strokes, hasLength(2));
    final b = _bounds(strokes);
    expect(b.minX, closeTo(left, eps));
    expect(b.maxX, closeTo(right, eps));
    expect(b.minY, greaterThanOrEqualTo(top - eps));
    expect(b.maxY, lessThanOrEqualTo(bottom + eps));
  });

  test('TC-SIGN-011 빈 획은 결과에서 빠지고 점의 개수·순서는 유지된다', () {
    const d = SignatureDrawing(
      width: canvasW,
      height: canvasH,
      strokes: [
        SignatureStroke([]),
        SignatureStroke([
          SignaturePoint(10, 10),
          SignaturePoint(20, 30),
          SignaturePoint(50, 40),
        ]),
      ],
    );
    final strokes = _layout(d);
    expect(strokes, hasLength(1));
    expect(strokes.single, hasLength(3));
    expect(strokes.single[0].x, lessThan(strokes.single[1].x));
    expect(strokes.single[1].x, lessThan(strokes.single[2].x));
  });

  test('TC-SIGN-011 수평 직선도 NaN·무한대 없이 영역을 가로지르고 세로 중앙에 놓인다', () {
    final d = strokeOf([(50, 100), (350, 100)]);
    final pts = _layout(d).expand((s) => s).toList();
    for (final p in pts) {
      expect(p.x.isFinite && p.y.isFinite, isTrue);
    }
    final b = _bounds(_layout(d));
    expect(b.minX, closeTo(left, eps));
    expect(b.maxX, closeTo(right, eps));
    expect(b.minY, closeTo(_h / 2, eps));
    expect(b.maxY, closeTo(_h / 2, eps));
  });

  test('TC-SIGN-011 수직 직선도 폭주하지 않고 세로 영역을 채운다', () {
    final d = strokeOf([(200, 10), (200, 190)]);
    final pts = _layout(d).expand((s) => s).toList();
    for (final p in pts) {
      expect(p.x.isFinite && p.y.isFinite, isTrue);
    }
    final b = _bounds(_layout(d));
    expect(b.minY, closeTo(top, eps));
    expect(b.maxY, closeTo(bottom, eps));
    expect(b.minX, closeTo(_w / 2, eps));
  });

  test('TC-SIGN-002 TC-SIGN-011 점 하나는 영역 중앙에 놓인다', () {
    final pts = _layout(blankDrawing().startStroke(10, 10)).single;
    expect(pts, hasLength(1));
    expect(pts.single.x, closeTo(_w / 2, eps));
    expect(pts.single.y, closeTo(_h / 2, eps));
  });

  test('TC-SIGN-011 같은 점을 반복해 찍어도(크기 0 박스) 유한한 좌표다', () {
    final d = strokeOf([(30, 30), (30, 30), (30, 30)]);
    for (final p in _layout(d).expand((s) => s)) {
      expect(p.x.isFinite && p.y.isFinite, isTrue);
      expect(p.x, closeTo(_w / 2, eps));
      expect(p.y, closeTo(_h / 2, eps));
    }
  });

  test('TC-SIGN-011 박스 한 변이 0.02 미만이면 0.02로 취급한다(거의 평평한 획)', () {
    // 높이 1px / 200px = 0.005 < 0.02: 최소 0.02로 취급하므로 가로 기준으로만 맞춰진다.
    final d = strokeOf([(50, 100), (350, 101)]);
    final b = _bounds(_layout(d));
    expect(b.minX, closeTo(left, eps));
    expect(b.maxX, closeTo(right, eps));
    // 세로 퍼짐은 영역 높이보다 훨씬 작다(최소 박스 0.02 * 영역 비율 이하).
    expect(b.maxY - b.minY, lessThan(10));
    expect((b.minY + b.maxY) / 2, closeTo(_h / 2, eps));
  });
}
