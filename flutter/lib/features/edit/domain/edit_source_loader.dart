import 'dart:typed_data';

import 'image_codec.dart';
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
  Future<EditSource> load(Uint8List bytes) => throw UnimplementedError();
}
