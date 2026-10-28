import 'dart:ui' as ui;

import 'package:chalkak/features/feed/presentation/feed_test_ids.dart';
import 'package:chalkak/features/feed/presentation/signed_photo.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';

class _FakeImage extends ImageProvider<_FakeImage> {
  const _FakeImage(this.image);
  final ui.Image image;

  @override
  Future<_FakeImage> obtainKey(ImageConfiguration configuration) =>
      Future.value(this);

  @override
  ImageStreamCompleter loadImage(_FakeImage key, ImageDecoderCallback decode) =>
      OneFrameImageStreamCompleter(Future.value(ImageInfo(image: image)));

  @override
  bool operator ==(Object other) => other is _FakeImage && other.image == image;

  @override
  int get hashCode => image.hashCode;
}

Future<ui.Image> _image(WidgetTester tester, int w, int h) async {
  final image = await tester.runAsync(() async {
    final recorder = ui.PictureRecorder();
    ui.Canvas(
      recorder,
    ).drawRect(ui.Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()), ui.Paint());
    return recorder.endRecording().toImage(w, h);
  });
  return image!;
}

void main() {
  widgetTest('REQ-FEED-003 가로 사진의 사인은 영역이 아니라 그려진 사진의 오른쪽 아래에 있다', (
    tester,
  ) async {
    final image = await _image(tester, 400, 200);
    await tester.pumpWidget(
      MaterialApp(
        home: Center(
          child: SizedBox(
            width: 300,
            height: 600,
            child: SignedPhoto(
              photoUrl: 'https://example.invalid/photo.png',
              signatureUrl: 'https://example.invalid/sign.png',
              photoProvider: _FakeImage(image),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    final area = tester.getRect(find.byType(SignedPhoto));
    // 300x600 영역 안의 400x200 사진은 300x150으로 가운데에 그려진다.
    final photoRect = Rect.fromLTWH(
      area.left,
      area.top + (600 - 150) / 2,
      300,
      150,
    );
    final signature = tester.getRect(byId(FeedTestIds.signatureImage));
    expect(signature.width, SignedPhoto.signatureWidth);
    expect(photoRect.contains(signature.topLeft), isTrue);
    expect(photoRect.inflate(0.01).contains(signature.bottomRight), isTrue);
    expect(
      signature.bottomRight,
      photoRect.bottomRight -
          const Offset(SignedPhoto.signatureInset, SignedPhoto.signatureInset),
    );
  });

  widgetTest('REQ-FEED-003 사진 크기를 모르면 사인은 영역의 오른쪽 아래에 있다', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Center(
          child: SizedBox(
            width: 300,
            height: 600,
            child: SignedPhoto(
              photoUrl: 'https://example.invalid/photo.png',
              signatureUrl: 'https://example.invalid/sign.png',
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    final area = tester.getRect(find.byType(SignedPhoto));
    final signature = tester.getRect(byId(FeedTestIds.signatureImage));
    expect(signature.right, area.right - SignedPhoto.signatureInset);
    expect(signature.bottom, area.bottom - SignedPhoto.signatureInset);
  });
}
