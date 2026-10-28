import 'package:chalkak/features/edit/domain/ruler_scale.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const scale = RulerScale();

  group('값 <-> 위치', () {
    test('TC-EDIT-038 단위(1.0)당 400dp, 50틱이 기본이다', () {
      expect(scale.dpPerUnit, 400);
      expect(scale.ticks, 50);
      expect(scale.valueToOffset(1), 400);
      expect(scale.valueToOffset(-1), -400);
      expect(scale.valueToOffset(0), 0);
      expect(scale.valueToOffset(0.5), 200);
    });

    test('TC-EDIT-038 값 -> 위치 -> 값 왕복에 오차가 없다(정수 표시값 -100~100)', () {
      for (var i = -100; i <= 100; i++) {
        final v = i / 100;
        expect(scale.offsetToValue(scale.valueToOffset(v)), closeTo(v, 1e-12));
      }
    });

    test('TC-EDIT-038 위치 -> 값 -> 위치 왕복에도 오차가 없다', () {
      for (final dp in [-400.0, -123.4, 0.0, 7.7, 399.9]) {
        expect(scale.valueToOffset(scale.offsetToValue(dp)), closeTo(dp, 1e-9));
      }
    });
  });

  group('디텐트', () {
    test('TC-EDIT-038 0 근처(8dp = 0.02 이내)는 0으로 붙는다', () {
      expect(scale.snap(0.015, [0]), 0);
      expect(scale.snap(-0.015, [0]), 0);
    });

    test('TC-EDIT-038 자동 보정 몫 근처도 그 값으로 붙는다', () {
      expect(scale.snap(0.41, [0, 0.4]), 0.4);
      expect(scale.snap(0.385, [0, 0.4]), 0.4);
    });

    test('TC-EDIT-038 범위 밖이면 값 그대로다', () {
      expect(scale.snap(0.05, [0, 0.4]), 0.05);
      expect(scale.snap(0.3, [0, 0.4]), 0.3);
      expect(scale.snap(0.7, const []), 0.7);
    });

    test('TC-EDIT-038 두 후보가 모두 범위 안이면 더 가까운 쪽으로 붙는다', () {
      expect(scale.snap(0.012, [0, 0.02]), 0.02);
      expect(scale.snap(0.009, [0, 0.02]), 0);
    });
  });
}
