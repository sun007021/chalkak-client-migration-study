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
  String? get imageChunk {
    for (final type in chunkTypes) {
      if (type == 'VP8 ' || type == 'VP8L') return type;
    }
    return null;
  }

  /// `ANIM`/`ANMF` 청크가 있는가(움직이는 이미지).
  bool get isAnimated =>
      chunkTypes.contains('ANIM') || chunkTypes.contains('ANMF');

  /// `EXIF`/`XMP `/`ICCP` 청크가 있는가.
  bool get hasMetadata =>
      chunkTypes.contains('EXIF') ||
      chunkTypes.contains('XMP ') ||
      chunkTypes.contains('ICCP');

  /// RIFF/WEBP 컨테이너이고 크기 필드가 맞으며 정지 이미지 청크가 있고 메타데이터·애니메이션이 없다.
  bool get isUploadable =>
      isRiffWebp &&
      riffSizeMatches &&
      imageChunk != null &&
      !hasMetadata &&
      !isAnimated;
}

abstract final class WebpInspector {
  /// 잘린 바이트나 WebP가 아닌 입력도 예외 없이 [WebpInfo.isRiffWebp]가 false인 값으로 돌려준다.
  static WebpInfo inspect(Uint8List bytes) {
    const none = WebpInfo(
      isRiffWebp: false,
      riffSizeMatches: false,
      chunkTypes: [],
    );
    if (bytes.length < 12) return none;
    String tag(int offset) => String.fromCharCodes(bytes, offset, offset + 4);
    if (tag(0) != 'RIFF' || tag(8) != 'WEBP') return none;

    final data = ByteData.sublistView(bytes);
    final riffSize = data.getUint32(4, Endian.little);
    final chunks = <String>[];
    var offset = 12;
    while (offset + 8 <= bytes.length) {
      chunks.add(tag(offset));
      final size = data.getUint32(offset + 4, Endian.little);
      offset += 8 + size + (size & 1);
    }
    return WebpInfo(
      isRiffWebp: true,
      riffSizeMatches: riffSize == bytes.length - 8,
      chunkTypes: chunks,
    );
  }
}
