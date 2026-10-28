import 'dart:typed_data';

/// 앱이 소유한 임시 WebP 파일. 제출이 끝나거나 실패하거나 화면을 나가면 지운다(REQ-UPL-048).
abstract interface class StoredPhoto {
  String get path;

  Future<Uint8List> readBytes();

  /// 이미 지워졌어도 오류 없이 끝난다.
  Future<void> delete();
}

/// 임시 파일 저장소.
abstract interface class PhotoFileStore {
  Future<StoredPhoto> write(Uint8List bytes);
}
