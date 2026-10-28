import 'package:chalkak/features/edit/domain/adjustment.dart';
import 'package:flutter_test/flutter_test.dart';

const _auto = AdjustmentValues(exposure: 0.4, contrast: 0.2);

AdjustmentLayers _layers({
  double strength = 1,
  Map<AdjustItem, double> user = const {},
}) => AdjustmentLayers(
  autoValues: _auto,
  autoStrength: strength,
  userValues: user,
);

void main() {
  group('항목에 적용되는 값', () {
    test('TC-EDIT-030 REQ-EDIT-022 사용자가 만졌으면 사용자 값, 아니면 자동값 x 강도(강도 1)', () {
      final v = _layers(user: {AdjustItem.exposure: 0.3}).effectiveValues;
      expect(v.exposure, closeTo(0.3, 1e-9));
      expect(v.contrast, closeTo(0.2, 1e-9));
    });

    test('TC-EDIT-030 강도 0.5이면 직접 만진 항목은 그대로, 나머지는 자동값의 절반', () {
      final v = _layers(
        strength: 0.5,
        user: {AdjustItem.exposure: 0.3},
      ).effectiveValues;
      expect(v.exposure, closeTo(0.3, 1e-9));
      expect(v.contrast, closeTo(0.1, 1e-9));
    });

    test('TC-EDIT-030 자동 보정을 끄면(강도 0) 직접 만진 항목만 남는다', () {
      final v = _layers(
        strength: 0,
        user: {AdjustItem.exposure: 0.3},
      ).effectiveValues;
      expect(v.exposure, closeTo(0.3, 1e-9));
      expect(v.contrast, 0);
    });

    test('REQ-EDIT-022 자동 보정 몫은 자동값 x 강도이고 꺼져 있으면 0이다', () {
      expect(_layers().autoShare(AdjustItem.exposure), closeTo(0.4, 1e-9));
      expect(
        _layers(strength: 0.25).autoShare(AdjustItem.contrast),
        closeTo(0.05, 1e-9),
      );
      expect(_layers(strength: 0).autoShare(AdjustItem.exposure), 0);
    });

    test('REQ-EDIT-022 강도를 바꿔도 직접 만진 항목은 그대로 남는다', () {
      final l = _layers(user: {AdjustItem.exposure: 0.3}).withAutoStrength(0.2);
      expect(l.effective(AdjustItem.exposure), closeTo(0.3, 1e-9));
      expect(l.isUserTouched(AdjustItem.exposure), isTrue);
    });
  });

  group('직접 만진 표시', () {
    test('TC-EDIT-031 REQ-EDIT-023 자동 보정 몫과 같은 값으로 되돌리면 직접 만진 표시가 지워진다', () {
      var l = _layers().withValue(AdjustItem.exposure, 0.1);
      expect(l.isUserTouched(AdjustItem.exposure), isTrue);
      l = l.withValue(AdjustItem.exposure, 0.4);
      expect(l.isUserTouched(AdjustItem.exposure), isFalse);
      // 다시 자동 보정을 따른다.
      expect(l.withAutoStrength(0.5).effective(AdjustItem.exposure), 0.2);
    });

    test('TC-EDIT-031 자동 보정이 꺼져 있으면 몫이 0이라 0으로 되돌릴 때 표시가 지워진다', () {
      var l = _layers(strength: 0).withValue(AdjustItem.contrast, 0.5);
      expect(l.isUserTouched(AdjustItem.contrast), isTrue);
      l = l.withValue(AdjustItem.contrast, 0);
      expect(l.isUserTouched(AdjustItem.contrast), isFalse);
    });

    test('TC-EDIT-031 자동 보정을 켜기 전에 만진 항목은 켜도 사용자 값이 유지된다', () {
      var l = const AdjustmentLayers().withValue(AdjustItem.exposure, 0.3);
      l = l.withAutoValues(_auto).withAutoStrength(1);
      expect(l.effective(AdjustItem.exposure), closeTo(0.3, 1e-9));
      expect(l.effective(AdjustItem.contrast), closeTo(0.2, 1e-9));
    });

    test('REQ-EDIT-023 직접 만지지 않은 항목은 isUserTouched가 false다', () {
      expect(_layers().isUserTouched(AdjustItem.contrast), isFalse);
    });
  });

  group('초기화와 항등', () {
    test('REQ-EDIT-024 초기화는 강도 0, 직접 만진 값 삭제, 분석한 자동값은 유지한다', () {
      final l = _layers(user: {AdjustItem.exposure: 0.3}).cleared();
      expect(l.autoStrength, 0);
      expect(l.userValues, isEmpty);
      expect(l.autoValues, _auto);
      expect(l.isIdentity, isTrue);
    });

    test('REQ-EDIT-005 적용 값이 전부 0이면 isIdentity, 하나라도 있으면 아니다', () {
      expect(const AdjustmentLayers().isIdentity, isTrue);
      expect(_layers(strength: 0).isIdentity, isTrue);
      expect(_layers().isIdentity, isFalse);
      expect(
        const AdjustmentLayers(userValues: {AdjustItem.shadows: 0.01})
            .isIdentity,
        isFalse,
      );
    });

    test('==/hashCode는 값으로 비교한다', () {
      expect(_layers() == _layers(), isTrue);
      expect(_layers().hashCode, _layers().hashCode);
      expect(_layers(strength: 0.5) == _layers(), isFalse);
    });
  });
}
