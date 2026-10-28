import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../edit/domain/image_codec.dart';
import '../../edit/domain/photo_edit.dart';
import '../../edit/domain/photo_edit_renderer.dart';
import '../../edit/domain/rgba_image.dart';

/// 한 장을 [quality](0~100)로 손실 WebP 압축한다. 플랫폼 인코더 뒤의 인터페이스이며
/// 테스트는 품질별 크기를 표로 돌려주는 Fake로 사다리 로직을 결정적으로 검증한다.
abstract interface class WebpCompressor {
  /// 정지 이미지 lossy WebP. EXIF·XMP·ICC 등 메타데이터는 넣지 않는다.
  Future<Uint8List> compress(RgbaImage image, {required int quality});
}

enum PhotoEncodeFailure {
  /// 비었거나 손상된 데이터.
  unreadable,

  /// 플랫폼 디코더가 지원하지 않는 형식.
  unsupported,

  /// 4라운드 안에 maxBytes 이하가 되지 못했다(SizeLimitExceeded).
  sizeLimitExceeded,

  /// 취소됐다. 결과를 돌려주지 않는다.
  cancelled,
}

class PhotoEncodeException implements Exception {
  const PhotoEncodeException(this.reason);

  final PhotoEncodeFailure reason;

  @override
  String toString() => 'PhotoEncodeException($reason)';
}

class EncodedPhoto {
  const EncodedPhoto({
    required this.bytes,
    required this.width,
    required this.height,
    required this.quality,
  });

  final Uint8List bytes;
  final int width;
  final int height;

  /// 채택된 품질(90, 80, 60, 40 중 하나).
  final int quality;
}

/// 업로드용 WebP 인코더(REQ-UPL-027~033, POST-004).
///
/// 순서: 디코더로 크기만 읽기(`readBounds`) -> 긴 변이 4096 이하(확대 없음, 가로세로 비율 오차 1px
/// 이내)가 되는 크기로 바로 디코드 -> 편집이 있으면(`!edit.isIdentity`) 렌더러로 다시 그리기,
/// 없으면 건너뛰기 -> 품질 사다리 [90, 80, 60, 40]를 차례로 압축해 처음으로 `maxBytes` 이하인
/// 결과를 채택(정확히 maxBytes는 허용, 1바이트 초과는 실패). 40에서도 초과하면 가로·세로를 0.85배로
/// (반올림) 줄여 사다리를 처음부터 다시, 축소는 최대 3번(총 4라운드, 최대 16회 압축).
/// 중간 라운드에서 성공하면 즉시 종료한다. 편집 결과는 손실 압축을 한 번만 거친다(중간 JPEG 없음).
/// 4라운드 후에도 초과하면 [PhotoEncodeFailure.sizeLimitExceeded].
/// [cancelToken]이 취소되면 다음 압축부터 하지 않고 [PhotoEncodeFailure.cancelled]로 끝난다.
class PostImageEncoder {
  const PostImageEncoder({
    required this.decoder,
    required this.scaler,
    required this.compressor,
    required this.renderer,
  });

  final ImageDecoder decoder;
  final ImageScaler scaler;
  final WebpCompressor compressor;
  final PhotoEditRenderer renderer;

  Future<EncodedPhoto> encode(
    Uint8List source, {
    required PhotoEdit edit,
    required int maxBytes,
    CancelToken? cancelToken,
  }) => throw UnimplementedError();
}
