import 'package:chalkak/core/time/instant_parser.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TC-TIME-025 Z, +00:00, 소수초 없음/3/6/9자리가 같은 순간', () {
    final base = DateTime.utc(2026, 10, 20, 5);
    expect(parseInstant('2026-10-20T05:00:00Z'), base);
    expect(parseInstant('2026-10-20T05:00:00+00:00'), base);
    expect(parseInstant('2026-10-20T05:00:00.000Z'), base);
    expect(parseInstant('2026-10-20T05:00:00.000000Z'), base);
    expect(parseInstant('2026-10-20T05:00:00.000000000Z'), base);
    expect(
      parseInstant('2026-10-20T05:00:00.123Z'),
      DateTime.utc(2026, 10, 20, 5, 0, 0, 123),
    );
    expect(
      parseInstant('2026-10-20T05:00:00.123456789Z'),
      DateTime.utc(2026, 10, 20, 5, 0, 0, 123, 456),
    );
    expect(parseInstant('2026-10-20T05:00:00Z')!.isUtc, isTrue);
  });

  test('TC-TIME-026 파싱할 수 없는 문자열은 null이고 던지지 않는다', () {
    for (final bad in ['', 'garbage', '2026-13-40T00:00:00Z', '2026-10-20']) {
      expect(parseInstant(bad), isNull, reason: bad);
    }
  });
}
