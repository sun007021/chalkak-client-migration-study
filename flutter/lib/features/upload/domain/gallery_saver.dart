import 'dart:typed_data';

/// 촬영본을 기기 앨범에 저장한다. 권한 거부·실패는 예외로 던진다.
abstract interface class GallerySaver {
  /// [fileName]은 [CaptureFileName.next]가 만든 이름(JPEG).
  Future<void> saveJpeg(Uint8List bytes, {required String fileName});
}

/// 촬영본 저장 파일명 규칙: `chalkak-photo-<시각>.jpg`(REQ-UPL-014, TC-UPL-016).
abstract final class CaptureFileName {
  /// [now]는 `clock.now()`. 같은 시각이면 같은 이름이다.
  static String next(DateTime now) => throw UnimplementedError();
}
