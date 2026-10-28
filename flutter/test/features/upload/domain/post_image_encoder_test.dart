import 'dart:math' as math;
import 'dart:typed_data';

import 'package:chalkak/features/edit/domain/crop_window.dart';
import 'package:chalkak/features/edit/domain/image_codec.dart';
import 'package:chalkak/features/edit/domain/photo_edit.dart';
import 'package:chalkak/features/upload/domain/post_image_encoder.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/upload_fakes.dart';

const _max = 5242880;

class _Rig {
  _Rig({
    int width = 4000,
    int height = 3000,
    int Function(int quality, int w, int h)? size,
  }) {
    decoder.bounds = ImageBounds(width, height);
    compressor = FakeWebpCompressor(
      (q, img) => size == null ? 1000 : size(q, img.width, img.height),
    );
    encoder = PostImageEncoder(
      decoder: decoder,
      scaler: scaler,
      compressor: compressor,
      renderer: renderer,
    );
  }

  final FakeImageDecoder decoder = FakeImageDecoder();
  final FakeImageScaler scaler = FakeImageScaler();
  final FakePhotoEditRenderer renderer = FakePhotoEditRenderer();
  late final FakeWebpCompressor compressor;
  late final PostImageEncoder encoder;

  Future<EncodedPhoto> encode({
    PhotoEdit edit = PhotoEdit.identity,
    int maxBytes = _max,
    CancelToken? cancelToken,
  }) => encoder.encode(
    photoBytes(),
    edit: edit,
    maxBytes: maxBytes,
    cancelToken: cancelToken,
  );
}

Future<PhotoEncodeException> _failure(Future<Object?> Function() call) async {
  try {
    await call();
  } on PhotoEncodeException catch (e) {
    return e;
  }
  fail('PhotoEncodeException이 와야 한다');
}

/// 품질 [okQuality] 이하에서만 maxBytes 이하가 되는 압축기 크기 표.
int Function(int, int, int) _okFrom(int okQuality) =>
    (q, w, h) => q <= okQuality ? 100 : _max + 1;

void main() {
  group('크기 사다리 (REQ-UPL-027)', () {
    test('TC-UPL-034 8000x6000은 긴 변 4096 이하·비율 1px 이내로 디코드한다', () async {
      final r = _Rig(width: 8000, height: 6000);
      await r.encode();
      final d = r.decoder.decodes.single;
      expect(math.max(d.width, d.height), lessThanOrEqualTo(4096));
      expect((d.height - d.width * 6000 / 8000).abs(), lessThanOrEqualTo(1));
    });

    test(
      'TC-UPL-034 4096x3072는 그대로, 4097x3000은 4096 이하로, 작은 사진은 확대하지 않는다',
      () async {
        final same = _Rig(width: 4096, height: 3072);
        await same.encode();
        expect(same.decoder.decodes.single, (width: 4096, height: 3072));

        final over = _Rig(width: 4097, height: 3000);
        await over.encode();
        final d = over.decoder.decodes.single;
        expect(math.max(d.width, d.height), lessThanOrEqualTo(4096));
        expect((d.height - d.width * 3000 / 4097).abs(), lessThanOrEqualTo(1));

        final small = _Rig(width: 800, height: 600);
        await small.encode();
        expect(small.decoder.decodes.single, (width: 800, height: 600));
      },
    );

    test('TC-UPL-035 크기만 먼저 읽고 전체 해상도로 디코드하지 않는다', () async {
      final r = _Rig(width: 8000, height: 6000);
      await r.encode();
      expect(r.decoder.log.first, 'bounds');
      expect(r.decoder.decodes, hasLength(1));
      expect(r.decoder.log, isNot(contains('decode:8000x6000')));
    });
  });

  group('품질 사다리 [90, 80, 60, 40] (REQ-UPL-030)', () {
    test('TC-UPL-037 90에서 maxBytes 이하면 90 한 번만 시도한다', () async {
      final r = _Rig(size: _okFrom(90));
      final out = await r.encode();
      expect(r.compressor.qualities, [90]);
      expect(out.quality, 90);
    });

    test('TC-UPL-037 90 초과·80 이하면 90, 80 순서이다', () async {
      final r = _Rig(size: _okFrom(80));
      final out = await r.encode();
      expect(r.compressor.qualities, [90, 80]);
      expect(out.quality, 80);
    });

    test('TC-UPL-037 80 초과·60 이하면 90, 80, 60 순서이다', () async {
      final r = _Rig(size: _okFrom(60));
      await r.encode();
      expect(r.compressor.qualities, [90, 80, 60]);
    });

    test('TC-UPL-037 60 초과·40 이하면 90, 80, 60, 40 순서이다', () async {
      final r = _Rig(size: _okFrom(40));
      final out = await r.encode();
      expect(r.compressor.qualities, [90, 80, 60, 40]);
      expect(out.quality, 40);
    });

    test('TC-UPL-039 정확히 5,242,880바이트는 허용하고 5,242,881바이트는 다음 단계로 간다', () async {
      final exact = _Rig(size: (q, w, h) => 5242880);
      await exact.encode();
      expect(exact.compressor.qualities, [90]);

      final over = _Rig(size: (q, w, h) => q == 90 ? 5242881 : 5242880);
      final out = await over.encode();
      expect(over.compressor.qualities, [90, 80]);
      expect(out.quality, 80);
    });

    test('TC-UPL-039 maxBytes는 인자로 받은 정책 값을 쓴다', () async {
      final r = _Rig(size: (q, w, h) => 1000000);
      await r.encode(maxBytes: 1000000);
      expect(r.compressor.qualities, [90]);
      final r2 = _Rig(size: (q, w, h) => 1000001);
      await _failure(() => r2.encode(maxBytes: 1000000));
      expect(r2.compressor.calls, hasLength(16));
    });
  });

  group('축소 라운드 (REQ-UPL-031~032)', () {
    test(
      'TC-UPL-038 모든 품질에서 초과하면 0.85배씩 3번 줄여 총 16회 시도 후 SizeLimitExceeded이다',
      () async {
        final r = _Rig(width: 2000, height: 1500, size: (q, w, h) => _max + 1);
        final e = await _failure(() => r.encode());
        expect(e.reason, PhotoEncodeFailure.sizeLimitExceeded);
        expect(r.compressor.calls, hasLength(16));
        expect(r.compressor.qualities, [
          for (var i = 0; i < 4; i++) ...[90, 80, 60, 40],
        ]);
        for (var round = 0; round < 4; round++) {
          final factor = math.pow(0.85, round);
          for (final c in r.compressor.calls.skip(round * 4).take(4)) {
            expect(
              c.width,
              closeTo(2000 * factor, 1.5),
              reason: 'round $round',
            );
            expect(
              c.height,
              closeTo(1500 * factor, 1.5),
              reason: 'round $round',
            );
          }
        }
      },
    );

    test('TC-UPL-038 중간 라운드에서 성공하면 즉시 끝난다', () async {
      final r = _Rig(
        width: 2000,
        height: 1500,
        size: (q, w, h) => w <= 1500 ? 100 : _max + 1,
      );
      final out = await r.encode();
      // 라운드 0(2000), 1(1700)은 실패 8회, 라운드 2(1445)의 첫 시도(90)에서 성공.
      expect(r.compressor.calls, hasLength(9));
      expect(out.quality, 90);
      expect(out.width, closeTo(2000 * 0.85 * 0.85, 1.5));
    });

    test('TC-UPL-042 불가능한 maxBytes(1,000)는 SizeLimitExceeded로 실패한다', () async {
      final r = _Rig(size: (q, w, h) => 100000);
      final e = await _failure(() => r.encode(maxBytes: 1000));
      expect(e.reason, PhotoEncodeFailure.sizeLimitExceeded);
    });
  });

  group('편집 적용과 결정성', () {
    test(
      'TC-UPL-045 TC-EDIT-011 편집이 없으면 재그리기를 건너뛰고 두 번 인코딩한 바이트가 같다',
      () async {
        final r = _Rig();
        final a = await r.encode();
        final b = await r.encode();
        expect(r.renderer.renders, 0);
        expect(a.bytes, b.bytes);
      },
    );

    test('TC-EDIT-010 편집이 있으면 렌더 1회 뒤 손실 압축은 한 번만 일어난다', () async {
      final r = _Rig(size: _okFrom(90));
      const edit = PhotoEdit(quarterTurns: 1);
      await r.encode(edit: edit);
      expect(r.renderer.edits, [edit]);
      expect(r.compressor.calls, hasLength(1));
    });

    test('TC-EDIT-020 큰 사진은 긴 변을 4096 이하로 줄인 이미지에 편집을 적용한다', () async {
      final r = _Rig(width: 8000, height: 6000);
      const crop = CropWindow(
        centerX: 0.5,
        centerY: 0.5,
        width: 0.25,
        height: 0.25,
      );
      await r.encode(edit: const PhotoEdit(crop: crop));
      final input = r.renderer.inputs.single;
      expect(math.max(input.width, input.height), lessThanOrEqualTo(4096));
      expect(r.renderer.edits.single.crop, crop);
    });
  });

  group('취소와 실패 (REQ-UPL-034)', () {
    test('TC-UPL-046 사다리 도중 취소하면 후속 압축을 하지 않고 cancelled로 끝난다', () async {
      final r = _Rig(size: (q, w, h) => _max + 1);
      final token = CancelToken();
      r.compressor.onCall = (i) {
        if (i == 2) token.cancel();
      };
      final e = await _failure(() => r.encode(cancelToken: token));
      expect(e.reason, PhotoEncodeFailure.cancelled);
      expect(r.compressor.calls, hasLength(2));
    });

    test('TC-UPL-046 시작 전에 취소돼 있으면 압축하지 않는다', () async {
      final r = _Rig();
      final token = CancelToken()..cancel();
      final e = await _failure(() => r.encode(cancelToken: token));
      expect(e.reason, PhotoEncodeFailure.cancelled);
      expect(r.compressor.calls, isEmpty);
    });

    test(
      'TC-UPL-044 지원하지 않는 형식은 unsupported, 손상·빈 데이터는 unreadable이다',
      () async {
        final unsupported = _Rig();
        unsupported.decoder.error = const ImageDecodeException(
          'heic',
          unsupported: true,
        );
        expect(
          (await _failure(() => unsupported.encode())).reason,
          PhotoEncodeFailure.unsupported,
        );

        final corrupt = _Rig();
        expect(
          (await _failure(
            () => corrupt.encoder.encode(
              Uint8List(0),
              edit: PhotoEdit.identity,
              maxBytes: _max,
            ),
          )).reason,
          PhotoEncodeFailure.unreadable,
        );
      },
    );
  });
}
