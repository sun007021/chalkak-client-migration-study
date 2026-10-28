import 'dart:typed_data';

/// 인코딩 결과 WebP의 구조를 읽는다(REQ-UPL-033, TC-UPL-032·033). 디코드는 하지 않는다.
class WebpInfo {
  const WebpInfo({
    required this.isRiffWebp,
    required this.riffSizeMatches,
    required this.chunkTypes,
  });

  /// `RIFF`로 시작하고 8~11번째 바이트가 `WEBP`인가.
  final bool isRiffWebp;

  /// RIFF 크기 필드 == 전체 길이 - 8.
  final bool riffSizeMatches;

  /// 컨테이너의 최상위 청크 4글자 이름을 순서대로(`VP8 `, `VP8L`, `VP8X`, `ANIM`, `EXIF` 등).
  final List<String> chunkTypes;

  /// 첫 이미지 청크: `VP8 ` 또는 `VP8L`. 없으면 null.
  String? get imageChunk => throw UnimplementedError();

  /// `ANIM`/`ANMF` 청크가 있는가(움직이는 이미지).
  bool get isAnimated => throw UnimplementedError();

  /// `EXIF`/`XMP `/`ICCP` 청크가 있는가.
  bool get hasMetadata => throw UnimplementedError();

  /// RIFF/WEBP 컨테이너이고 크기 필드가 맞으며 정지 이미지 청크가 있고 메타데이터·애니메이션이 없다.
  bool get isUploadable => throw UnimplementedError();
}

abstract final class WebpInspector {
  /// 잘린 바이트나 WebP가 아닌 입력도 예외 없이 [WebpInfo.isRiffWebp]가 false인 값으로 돌려준다.
  static WebpInfo inspect(Uint8List bytes) => throw UnimplementedError();
}
