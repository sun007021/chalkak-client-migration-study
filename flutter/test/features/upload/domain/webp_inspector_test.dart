import 'dart:typed_data';

import 'package:chalkak/features/upload/domain/webp_inspector.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/webp_builder.dart';

final _stillLossy = buildWebp([('VP8 ', List.filled(10, 7))]);

void main() {
  group('컨테이너 헤더 (TC-UPL-032)', () {
    test('TC-UPL-032 RIFF로 시작하고 8~11번째 바이트가 WEBP이며 크기 필드 = 전체 길이 - 8이다', () {
      final info = WebpInspector.inspect(_stillLossy);
      expect(String.fromCharCodes(_stillLossy.sublist(0, 4)), 'RIFF');
      expect(String.fromCharCodes(_stillLossy.sublist(8, 12)), 'WEBP');
      expect(info.isRiffWebp, isTrue);
      expect(info.riffSizeMatches, isTrue);
    });

    test('TC-UPL-032 RIFF 크기 필드가 어긋나면 riffSizeMatches가 false이다', () {
      final bad = buildWebp([
        ('VP8 ', List.filled(10, 7)),
      ], riffSizeOverride: 5);
      final info = WebpInspector.inspect(bad);
      expect(info.isRiffWebp, isTrue);
      expect(info.riffSizeMatches, isFalse);
      expect(info.isUploadable, isFalse);
    });

    test('TC-UPL-032 WebP가 아닌 입력·잘린 입력·빈 입력은 예외 없이 isRiffWebp=false이다', () {
      for (final bytes in [
        Uint8List(0),
        Uint8List.fromList([0x52, 0x49, 0x46]),
        buildWebp([
          ('VP8 ', [1, 2]),
        ], form: 'WAVE'),
        buildWebp([
          ('VP8 ', [1, 2]),
        ], magic: 'RIFX'),
        Uint8List.fromList(List.filled(40, 0xff)),
      ]) {
        final info = WebpInspector.inspect(bytes);
        expect(info.isRiffWebp, isFalse);
        expect(info.isUploadable, isFalse);
      }
    });
  });

  group('청크 순회 (TC-UPL-033)', () {
    test('TC-UPL-033 첫 이미지 청크는 VP8 또는 VP8L이다', () {
      expect(WebpInspector.inspect(_stillLossy).imageChunk, 'VP8 ');
      final lossless = buildWebp([('VP8L', List.filled(9, 1))]);
      expect(WebpInspector.inspect(lossless).imageChunk, 'VP8L');
    });

    test('TC-UPL-033 VP8X + 정지 이미지도 업로드할 수 있다', () {
      final x = buildWebp([
        ('VP8X', List.filled(10, 0)),
        ('VP8 ', List.filled(10, 7)),
      ]);
      final info = WebpInspector.inspect(x);
      expect(info.chunkTypes, ['VP8X', 'VP8 ']);
      expect(info.imageChunk, 'VP8 ');
      expect(info.isUploadable, isTrue);
    });

    test('TC-UPL-033 홀수 길이 청크의 패딩을 건너뛰고 다음 청크를 읽는다', () {
      final odd = buildWebp([
        ('VP8X', List.filled(10, 0)),
        ('VP8 ', List.filled(11, 7)),
        ('JUNK', List.filled(3, 0)),
      ]);
      expect(WebpInspector.inspect(odd).chunkTypes, ['VP8X', 'VP8 ', 'JUNK']);
    });

    test('TC-UPL-033 EXIF·XMP·ICCP 청크가 있으면 메타데이터가 있다고 보고 업로드 불가이다', () {
      for (final meta in ['EXIF', 'XMP ', 'ICCP']) {
        final withMeta = buildWebp([
          ('VP8X', List.filled(10, 0)),
          (meta, List.filled(8, 1)),
          ('VP8 ', List.filled(10, 7)),
        ]);
        final info = WebpInspector.inspect(withMeta);
        expect(info.hasMetadata, isTrue, reason: meta);
        expect(info.isUploadable, isFalse, reason: meta);
      }
      expect(WebpInspector.inspect(_stillLossy).hasMetadata, isFalse);
    });
  });

  group('움직이는 이미지 (TC-UPL-043)', () {
    test('TC-UPL-043 ANIM·ANMF 청크가 있으면 움직이는 이미지이고 업로드 불가이다', () {
      final animated = buildWebp([
        ('VP8X', List.filled(10, 0)),
        ('ANIM', List.filled(6, 0)),
        ('ANMF', List.filled(20, 0)),
        ('ANMF', List.filled(20, 0)),
      ]);
      final info = WebpInspector.inspect(animated);
      expect(info.isAnimated, isTrue);
      expect(info.isUploadable, isFalse);
    });

    test('TC-UPL-043 정지 이미지는 움직이는 이미지가 아니다', () {
      expect(WebpInspector.inspect(_stillLossy).isAnimated, isFalse);
      expect(WebpInspector.inspect(_stillLossy).isUploadable, isTrue);
    });
  });
}
