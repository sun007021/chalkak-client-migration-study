import 'dart:convert';
import 'dart:typed_data';

/// 테스트용 WebP 컨테이너 조립기. 청크는 (4글자 이름, 내용)이고 홀수 길이는 1바이트 패딩한다.
/// 이미지 데이터는 흉내일 뿐이며 디코드는 되지 않는다.
Uint8List buildWebp(
  List<(String, List<int>)> chunks, {
  int? riffSizeOverride,
  String form = 'WEBP',
  String magic = 'RIFF',
}) {
  final body = BytesBuilder();
  body.add(ascii.encode(form));
  for (final (type, payload) in chunks) {
    body.add(ascii.encode(type));
    body.add(_le32(payload.length));
    body.add(payload);
    if (payload.length.isOdd) body.addByte(0);
  }
  final bodyBytes = body.toBytes();
  final out = BytesBuilder();
  out.add(ascii.encode(magic));
  out.add(_le32(riffSizeOverride ?? bodyBytes.length));
  out.add(bodyBytes);
  return out.toBytes();
}

Uint8List _le32(int v) =>
    Uint8List(4)..buffer.asByteData().setUint32(0, v, Endian.little);
