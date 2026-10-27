import 'package:chalkak/core/network/api_format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TC-NET-052 UUID는 소문자 정규형으로 보낸다', () {
    expect(
      ApiFormat.uuid('1A2B3C4D-AAAA-BBBB-CCCC-0123456789AB'),
      '1a2b3c4d-aaaa-bbbb-cccc-0123456789ab',
    );
    expect(ApiFormat.uuid('abc'), 'abc'); // 이미 소문자면 그대로
  });

  test('TC-NET-053 date는 yyyy-MM-dd ASCII이고 한 자리 월·일은 0으로 채운다', () {
    expect(ApiFormat.date(DateTime(2026, 1, 5)), '2026-01-05');
    expect(ApiFormat.date(DateTime(2026, 12, 31, 23, 59)), '2026-12-31');
    expect(ApiFormat.date(DateTime.utc(2027, 2, 28)), '2027-02-28');
  });

  test('TC-NET-053 정수는 로캘과 무관한 10진수다(천 단위 구분 없음)', () {
    expect(ApiFormat.integer(0), '0');
    expect(ApiFormat.integer(1234567), '1234567');
    expect(ApiFormat.integer(-3), '-3');
    expect(RegExp(r'^-?[0-9]+$').hasMatch(ApiFormat.integer(20)), isTrue);
  });

  test('TC-NET-053 sort는 소문자다', () {
    expect(ApiFormat.sort('LATEST'), 'latest');
    expect(ApiFormat.sort('Random'), 'random');
  });
}
