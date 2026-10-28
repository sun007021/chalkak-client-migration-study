import 'dart:typed_data';

import 'package:chalkak/features/edit/domain/edit_source_loader.dart';
import 'package:chalkak/features/edit/domain/image_codec.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/upload_fakes.dart';

Uint8List _bytes() => photoBytes(2);

void main() {
  late FakeImageDecoder decoder;
  late DecodingEditSourceLoader loader;

  setUp(() {
    decoder = FakeImageDecoder();
    loader = DecodingEditSourceLoader(decoder: decoder);
  });

  group('편집용 이미지 준비', () {
    test(
      'TC-EDIT-009 큰 사진(8000x6000)은 긴 변 4096 이하로 줄여 편집 기준 크기로 넘긴다',
      () async {
        decoder.bounds = const ImageBounds(8000, 6000);
        final source = await loader.load(_bytes());
        expect(source.width, 4096);
        expect(source.height, 3072);
      },
    );

    test('TC-EDIT-009 REQ-EDIT-007 미리보기는 긴 변 1440 px 이내다', () async {
      decoder.bounds = const ImageBounds(8000, 6000);
      final source = await loader.load(_bytes());
      final longEdge = source.preview.width > source.preview.height
          ? source.preview.width
          : source.preview.height;
      expect(longEdge, lessThanOrEqualTo(1440));
      expect(
        source.preview.width / source.preview.height,
        closeTo(8000 / 6000, 0.01),
      );
    });

    test('TC-EDIT-009 작은 사진은 확대하지 않는다', () async {
      decoder.bounds = const ImageBounds(1000, 800);
      final source = await loader.load(_bytes());
      expect((source.width, source.height), (1000, 800));
      expect(source.preview.width, lessThanOrEqualTo(1000));
    });

    test(
      'TC-EDIT-009 EXIF 회전이 반영된 정방향 크기를 쓴다: 디코더가 알려 준 가로세로를 그대로 따른다',
      () async {
        // 방향 6(세로 촬영)의 4032x3024 사진을 디코더가 3024x4032로 알려 준다.
        decoder.bounds = const ImageBounds(3024, 4032);
        final source = await loader.load(_bytes());
        expect((source.width, source.height), (3024, 4032));
        expect(source.preview.height, greaterThan(source.preview.width));
      },
    );

    test('TC-EDIT-009 전체 해상도로 디코드하지 않고 목표 크기로 바로 디코드한다', () async {
      decoder.bounds = const ImageBounds(8000, 6000);
      await loader.load(_bytes());
      expect(decoder.log.first, 'bounds');
      for (final d in decoder.decodes) {
        expect(d.width, lessThanOrEqualTo(4096));
        expect(d.height, lessThanOrEqualTo(4096));
      }
    });

    test('TC-EDIT-009 읽을 수 없는 사진은 예외를 던진다', () async {
      decoder.isCorrupt = (_) => true;
      await expectLater(
        loader.load(_bytes()),
        throwsA(isA<ImageDecodeException>()),
      );
    });
  });
}
