import 'dart:typed_data';

/// 촬영본을 기기 앨범에 저장한다. 권한 거부·실패는 예외로 던진다.
abstract interface class GallerySaver {
  /// [fileName]은 [CaptureFileName.next]가 만든 이름(JPEG).
  Future<void> saveJpeg(Uint8List bytes, {required String fileName});
}

/// 촬영본 저장 파일명 규칙: `chalkak-photo-<시각>.jpg`(REQ-UPL-014, TC-UPL-016).
abstract final class CaptureFileName {
  /// [now]는 `clock.now()`. 같은 시각이면 같은 이름이다.
  static String next(DateTime now) {
    String two(int v) => v.toString().padLeft(2, '0');
    final date =
        '${now.year.toString().padLeft(4, '0')}${two(now.month)}'
        '${two(now.day)}';
    final time = '${two(now.hour)}${two(now.minute)}${two(now.second)}';
    return 'chalkak-photo-$date-$time.jpg';
  }
}
