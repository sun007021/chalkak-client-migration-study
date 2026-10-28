import 'dart:typed_data';

import 'package:chalkak/features/upload/domain/webp_inspector.dart';
import 'package:chalkak/features/upload/domain/webp_metadata_stripper.dart';
import 'package:flutter_test/flutter_test.dart';

Uint8List chunk(String type, List<int> payload) {
  final b = BytesBuilder()
    ..add(type.codeUnits)
    ..add(
      (ByteData(
        4,
      )..setUint32(0, payload.length, Endian.little)).buffer.asUint8List(),
    )
    ..add(payload);
  if (payload.length.isOdd) b.addByte(0);
  return b.toBytes();
}

Uint8List riff(List<Uint8List> chunks, {List<int> trailing = const []}) {
  final body = BytesBuilder()..add('WEBP'.codeUnits);
  for (final c in chunks) {
    body.add(c);
  }
  final bodyBytes = body.toBytes();
  final out = BytesBuilder()
    ..add('RIFF'.codeUnits)
    ..add(
      (ByteData(
        4,
      )..setUint32(0, bodyBytes.length, Endian.little)).buffer.asUint8List(),
    )
    ..add(bodyBytes)
    ..add(trailing);
  return out.toBytes();
}

Uint8List vp8x(int flags) => chunk('VP8X', [flags, 0, 0, 0, 1, 0, 0, 1, 0, 0]);

void main() {
  // REQ-UPL-033 / TC-UPL-033
  group('TC-UPL-033 WebpMetadataStripper', () {
    test('VP8X+ICCP+VP8: ICCP 제거, 플래그 해제, 이미지 청크 보존', () {
      final image = chunk('VP8 ', List.generate(10, (i) => i + 1));
      final input = riff([
        vp8x(0x20),
        chunk('ICCP', [9, 9, 9, 9]),
        image,
      ]);
      expect(WebpInspector.inspect(input).isUploadable, isFalse);

      final out = WebpMetadataStripper.strip(input);
      final info = WebpInspector.inspect(out);
      expect(info.isUploadable, isTrue);
      expect(info.chunkTypes, ['VP8X', 'VP8 ']);
      expect(out[12 + 8], 0);
      expect(out.sublist(out.length - image.length), image);
    });

    test('VP8X+EXIF+XMP+VP8L: 알파 플래그는 유지하고 메타데이터만 제거', () {
      final image = chunk('VP8L', [1, 2, 3, 4, 5, 6]);
      final input = riff([
        vp8x(0x10 | 0x08 | 0x04),
        image,
        chunk('EXIF', [1, 2, 3]),
        chunk('XMP ', [4, 5]),
      ]);
      final out = WebpMetadataStripper.strip(input);
      final info = WebpInspector.inspect(out);
      expect(info.isUploadable, isTrue);
      expect(info.chunkTypes, ['VP8X', 'VP8L']);
      expect(out[20], 0x10);
      expect(out.sublist(out.length - image.length), image);
    });

    test('단순 VP8은 그대로(동일 인스턴스)', () {
      final input = riff([
        chunk('VP8 ', [1, 2, 3, 4]),
      ]);
      expect(identical(WebpMetadataStripper.strip(input), input), isTrue);
    });

    test('홀수 크기 청크의 패딩을 보존한다', () {
      final image = chunk('VP8 ', [1, 2, 3, 4, 5]);
      expect(image.length, 14);
      final input = riff([
        vp8x(0x20),
        chunk('ICCP', [7]),
        image,
      ]);
      final out = WebpMetadataStripper.strip(input);
      final info = WebpInspector.inspect(out);
      expect(info.isUploadable, isTrue);
      expect(out.length.isEven, isTrue);
      expect(out.sublist(out.length - image.length), image);
    });

    test('RIFF 뒤 쓰레기 바이트는 버리고 크기를 맞춘다', () {
      final input = riff(
        [
          vp8x(0x20),
          chunk('ICCP', [1, 2]),
          chunk('VP8 ', [1, 2, 3, 4]),
        ],
        trailing: [0, 0, 0],
      );
      expect(WebpInspector.inspect(input).riffSizeMatches, isFalse);
      final out = WebpMetadataStripper.strip(input);
      expect(WebpInspector.inspect(out).isUploadable, isTrue);
    });

    test('움직이는 이미지는 건드리지 않는다', () {
      final input = riff([
        vp8x(0x20 | 0x02),
        chunk('ICCP', [1, 2]),
        chunk('ANIM', [0, 0, 0, 0, 0, 0]),
        chunk('ANMF', List.filled(16, 0)),
      ]);
      final out = WebpMetadataStripper.strip(input);
      expect(out, input);
      expect(WebpInspector.inspect(out).isUploadable, isFalse);
    });

    test('WebP가 아니거나 잘린 입력은 그대로 돌려준다', () {
      final junk = Uint8List.fromList([1, 2, 3]);
      expect(WebpMetadataStripper.strip(junk), junk);
      final truncated = riff([chunk('VP8 ', List.filled(20, 1))]);
      final cut = Uint8List.sublistView(truncated, 0, truncated.length - 6);
      expect(WebpMetadataStripper.strip(cut), cut);
    });
  });
}
