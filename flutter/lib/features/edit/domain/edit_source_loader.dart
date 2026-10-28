import 'dart:typed_data';

import '../../../core/constants/app_constants.dart';
import 'image_codec.dart';
import 'photo_edit_constants.dart';
import 'rgba_image.dart';

/// 편집기에 넘기는 원본. [preview]는 EXIF 방향이 반영된 정방향 이미지로 긴 변 1440 px 이내이다.
/// [width], [height]는 편집 기준 크기(긴 변 4096 이하로 줄인 정방향 사진)이다.
class EditSource {
  const EditSource({
    required this.preview,
    required this.width,
    required this.height,
  });

  final RgbaImage preview;
  final int width;
  final int height;
}

/// 선택한 사진 바이트를 편집용 이미지로 준비한다(TC-EDIT-009, REQ-EDIT-007).
/// 긴 변을 4096 이하로 줄이고(확대하지 않는다) EXIF 회전을 반영한다.
abstract interface class EditSourceLoader {
  /// 읽을 수 없으면 예외를 던진다.
  Future<EditSource> load(Uint8List bytes);
}

/// [ImageDecoder] 위에서 [EditSourceLoader]를 구현한다.
class DecodingEditSourceLoader implements EditSourceLoader {
  const DecodingEditSourceLoader({required this.decoder});

  final ImageDecoder decoder;

  @override
  Future<EditSource> load(Uint8List bytes) async {
    final bounds = await decoder.readBounds(bytes);
    final edit = _fit(
      bounds.width,
      bounds.height,
      AppConstants.postImageMaxLongEdge,
    );
    final preview = _fit(edit.$1, edit.$2, PhotoEditConstants.previewLongEdge);
    final image = await decoder.decode(
      bytes,
      width: preview.$1,
      height: preview.$2,
    );
    return EditSource(preview: image, width: edit.$1, height: edit.$2);
  }

  /// 긴 변이 [limit] 이하가 되도록 줄인다(확대하지 않는다).
  static (int, int) _fit(int width, int height, int limit) {
    final longEdge = width > height ? width : height;
    if (longEdge <= limit) return (width, height);
    final scale = limit / longEdge;
    return (
      (width * scale).round().clamp(1, limit),
      (height * scale).round().clamp(1, limit),
    );
  }
}
