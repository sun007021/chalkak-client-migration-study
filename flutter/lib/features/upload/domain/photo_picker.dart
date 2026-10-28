import 'dart:typed_data';

/// 사진을 어디서 가져왔나. 카메라 촬영본만 기기 앨범에 저장한다(REQ-UPL-014).
enum PhotoOrigin { album, camera }

/// 사용자가 고르거나 찍은 사진 원본 바이트. 비어 있을 수 있다(REQ-UPL-018).
class PickedPhoto {
  const PickedPhoto({required this.bytes, required this.origin});

  final Uint8List bytes;
  final PhotoOrigin origin;
}

sealed class PickResult {
  const PickResult();
}

final class PhotoPicked extends PickResult {
  const PhotoPicked(this.photo);

  final PickedPhoto photo;
}

/// 선택기·카메라를 사용자가 닫았다. 상태를 바꾸지 않는다(TC-UPL-014).
final class PhotoPickCancelled extends PickResult {
  const PhotoPickCancelled();
}

/// 시스템 사진 선택기와 카메라 뒤의 인터페이스(plugin: image_picker 등).
/// E2E 빌드와 테스트는 Fake를 쓴다.
abstract interface class PhotoPicker {
  /// 카메라를 쓸 수 있는 기기인가. 없는 기기와 웹 데스크톱은 false(REQ-UPL-013).
  bool get isCameraAvailable;

  /// 권한이 필요 없는 시스템 선택기로 이미지 한 장(REQ-UPL-012).
  Future<PickResult> pickFromAlbum();

  /// 시스템 카메라로 한 장 촬영.
  Future<PickResult> capture();
}
