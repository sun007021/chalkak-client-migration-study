/// `major.minor[.patch]` 버전. iTunes lookup 결과와 설치 버전 비교용(D-15).
class AppVersion {
  const AppVersion(this.major, this.minor, this.patch);

  final int major;
  final int minor;
  final int patch;

  /// "1.2.3", "1.1"(patch=0)만 읽는다. 구성 수가 2~3이 아니거나 숫자가 아닌 조각,
  /// 음수, 빈 문자열이면 null.
  static AppVersion? tryParse(String raw) {
    final parts = raw.split('.');
    if (parts.length < 2 || parts.length > 3) return null;
    final numbers = <int>[];
    for (final part in parts) {
      if (!_digits.hasMatch(part)) return null;
      numbers.add(int.parse(part));
    }
    return AppVersion(
      numbers[0],
      numbers[1],
      numbers.length == 3 ? numbers[2] : 0,
    );
  }

  static final RegExp _digits = RegExp(r'^[0-9]+$');

  /// major 또는 minor가 [installed]보다 높을 때만 true. patch 차이는 무시한다.
  bool requiresUpdateFrom(AppVersion installed) =>
      major > installed.major ||
      (major == installed.major && minor > installed.minor);

  @override
  String toString() => '$major.$minor.$patch';
}
