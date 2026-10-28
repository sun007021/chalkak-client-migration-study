import 'dart:io';

import 'package:image_picker/image_picker.dart';

import '../domain/photo_picker.dart';

/// `image_picker` 기반 [PhotoPicker]. 앨범은 권한이 필요 없는 시스템 선택기를 쓴다(REQ-UPL-012).
/// 사용자가 닫으면 [PhotoPickCancelled]. 권한 거부 등 그 밖의 실패는 예외로 던지고
/// ViewModel이 "준비 실패" 문구로 바꾼다.
class ImagePickerPhotoPicker implements PhotoPicker {
  ImagePickerPhotoPicker({ImagePicker? picker})
    : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  @override
  bool get isCameraAvailable => Platform.isAndroid || Platform.isIOS;

  @override
  Future<PickResult> pickFromAlbum() => _pick(ImageSource.gallery);

  @override
  Future<PickResult> capture() => _pick(ImageSource.camera);

  Future<PickResult> _pick(ImageSource source) async {
    final file = await _picker.pickImage(source: source);
    if (file == null) return const PhotoPickCancelled();
    return PhotoPicked(
      PickedPhoto(
        bytes: await file.readAsBytes(),
        origin: source == ImageSource.camera
            ? PhotoOrigin.camera
            : PhotoOrigin.album,
      ),
    );
  }
}
