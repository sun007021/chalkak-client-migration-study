/// 서버 Instant(UTC ISO-8601, 소수 초 0/3/6/9자리, 'Z' 또는 '+00:00')를 파싱한다.
/// 파싱 불가면 null(크래시 금지). 결과는 UTC.
DateTime? parseInstant(String source) {
  final m = _pattern.firstMatch(source);
  if (m == null) return null;
  final y = int.parse(m.group(1)!);
  final mo = int.parse(m.group(2)!);
  final d = int.parse(m.group(3)!);
  final h = int.parse(m.group(4)!);
  final mi = int.parse(m.group(5)!);
  final s = int.parse(m.group(6)!);
  // Dart의 DateTime은 마이크로초까지만 지원하므로 9자리 중 나노초 3자리는 버린다.
  final fraction = (m.group(7) ?? '').padRight(9, '0');
  final ms = int.parse(fraction.substring(0, 3));
  final us = int.parse(fraction.substring(3, 6));
  final result = DateTime.utc(y, mo, d, h, mi, s, ms, us);
  // 존재하지 않는 날짜(2월 30일 등)·범위 밖 값은 DateTime이 넘겨서 정규화하므로 걸러낸다.
  if (result.year != y ||
      result.month != mo ||
      result.day != d ||
      h > 23 ||
      mi > 59 ||
      s > 59) {
    return null;
  }
  return result;
}

final _pattern = RegExp(
  r'^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})'
  r'(?:\.([0-9]{1,9}))?(?:Z|\+00:00)$',
);
