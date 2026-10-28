import 'dart:typed_data';

/// WebP 컨테이너에서 EXIF/XMP/ICCP 청크를 제거한다(REQ-UPL-033).
/// iOS의 SDWebImageWebPCoder는 VP8X + ICCP를 붙여 내보내므로 업로드 전에 정리한다.
/// 이미지 청크 바이트는 그대로 두고, VP8X 플래그 비트를 지우며, RIFF 크기를 다시 계산한다.
/// 움직이는 이미지·WebP가 아닌 입력·깨진 청크는 원본을 그대로 돌려준다(검사기가 거부하도록).
abstract final class WebpMetadataStripper {
  static const _iccFlag = 0x20;
  static const _exifFlag = 0x08;
  static const _xmpFlag = 0x04;
  static const _dropped = {'ICCP', 'EXIF', 'XMP '};

  static Uint8List strip(Uint8List bytes) {
    if (bytes.length < 12) return bytes;
    String tag(int o) => String.fromCharCodes(bytes, o, o + 4);
    if (tag(0) != 'RIFF' || tag(8) != 'WEBP') return bytes;

    final data = ByteData.sublistView(bytes);
    final riffSize = data.getUint32(4, Endian.little);
    // RIFF 크기가 가리키는 끝까지만 읽는다(뒤따르는 쓰레기 바이트는 버린다).
    final end = (riffSize + 8 >= 12 && riffSize + 8 <= bytes.length)
        ? riffSize + 8
        : bytes.length;

    final kept = <Uint8List>[];
    var changed = end != bytes.length;
    var offset = 12;
    while (offset < end) {
      if (offset + 8 > end) return bytes;
      final type = tag(offset);
      final size = data.getUint32(offset + 4, Endian.little);
      final total = 8 + size + (size & 1);
      if (offset + total > end) return bytes;
      if (type == 'ANIM' || type == 'ANMF') return bytes;
      if (_dropped.contains(type)) {
        changed = true;
      } else {
        final chunk = Uint8List.fromList(
          Uint8List.sublistView(bytes, offset, offset + total),
        );
        if (type == 'VP8X' && size >= 1) {
          final flags = chunk[8];
          final cleared = flags & ~(_iccFlag | _exifFlag | _xmpFlag) & 0xFF;
          if (cleared != flags) {
            chunk[8] = cleared;
            changed = true;
          }
        }
        kept.add(chunk);
      }
      offset += total;
    }
    if (!changed) return bytes;

    final bodyLength = kept.fold<int>(0, (n, c) => n + c.length);
    final out = Uint8List(12 + bodyLength);
    out.setRange(0, 4, bytes); // RIFF
    ByteData.sublistView(out).setUint32(4, 4 + bodyLength, Endian.little);
    out.setRange(8, 12, bytes, 8); // WEBP
    var pos = 12;
    for (final c in kept) {
      out.setRange(pos, pos + c.length, c);
      pos += c.length;
    }
    return out;
  }
}
