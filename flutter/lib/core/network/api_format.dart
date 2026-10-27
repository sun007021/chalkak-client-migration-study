/// 쿼리·경로 값을 서버가 받는 정규형으로 만든다(TC-NET-052, 053).
class ApiFormat {
  const ApiFormat._();

  /// 소문자 정규형 UUID.
  static String uuid(String value) => value.toLowerCase();

  /// 시각·로캘과 무관한 ASCII `yyyy-MM-dd`. DateTime의 연·월·일 필드를 그대로 쓴다.
  static String date(DateTime value) {
    final y = value.year.toString().padLeft(4, '0');
    final m = value.month.toString().padLeft(2, '0');
    final d = value.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  /// 로캘과 무관한 10진수.
  static String integer(int value) => value.toString();

  /// 소문자 sort 값.
  static String sort(String value) => value.toLowerCase();
}
