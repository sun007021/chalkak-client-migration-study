import 'package:chalkak/features/upload/domain/gallery_saver.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final pattern = RegExp(r'^chalkak-photo-.+\.jpg$');

  test('TC-UPL-016 촬영본 파일명은 chalkak-photo-*.jpg 규칙이다', () {
    final name = CaptureFileName.next(DateTime.utc(2026, 10, 27, 3));
    expect(name, matches(pattern));
  });

  test('TC-UPL-016 같은 시각이면 같은 이름, 다른 시각이면 다른 이름이다', () {
    final a = CaptureFileName.next(DateTime.utc(2026, 10, 27, 3, 0, 0));
    final b = CaptureFileName.next(DateTime.utc(2026, 10, 27, 3, 0, 0));
    final c = CaptureFileName.next(DateTime.utc(2026, 10, 27, 3, 0, 1));
    expect(a, b);
    expect(c, isNot(a));
    expect(c, matches(pattern));
  });
}
