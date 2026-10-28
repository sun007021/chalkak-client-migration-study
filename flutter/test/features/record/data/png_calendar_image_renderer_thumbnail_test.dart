import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/record/data/png_calendar_image_renderer.dart';
import 'package:chalkak/features/record/domain/record_calendar_image.dart';
import 'package:chalkak/features/record/domain/record_models.dart';
import 'package:flutter_test/flutter_test.dart';

const _spec = RecordCalendarImageSpec(
  month: KstMonth(2026, 10),
  photos: [
    RecordPhoto(
      topicDate: KstDate(2026, 10, 20),
      postId: 'a',
      thumbnailImageUrl: 'https://cdn.example.test/a.webp',
      status: RecordPhotoStatus.approved,
    ),
    RecordPhoto(
      topicDate: KstDate(2026, 10, 27),
      postId: 'b',
      thumbnailImageUrl: 'https://cdn.example.test/b.webp',
      status: RecordPhotoStatus.pending,
    ),
  ],
);

void main() {
  testWidgets('TC-REC-038 썸네일 받기에 실패하거나 깨져 있어도 달력은 PNG로 그려진다', (tester) async {
    await tester.runAsync(() async {
      final requested = <String>[];
      final renderer = PngCalendarImageRenderer(
        thumbnailLoader: (url) async {
          requested.add(url);
          if (url.endsWith('a.webp')) return null;
          return Uint8List.fromList([1, 2, 3]); // 해독할 수 없는 바이트
        },
      );
      final bytes = await renderer.render(_spec);
      expect(requested, hasLength(2));
      expect(bytes.take(8), [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    });
  });

  testWidgets('TC-REC-038 받은 썸네일을 칸에 담아 그린다', (tester) async {
    await tester.runAsync(() async {
      // 썸네일 자리에 쓸 실제 이미지: 빈 달을 그린 PNG를 재사용한다.
      final thumb = await const PngCalendarImageRenderer().render(
        const RecordCalendarImageSpec(month: KstMonth(2026, 2), photos: []),
      );
      final plain = await PngCalendarImageRenderer(
        thumbnailLoader: (_) async => null,
      ).render(_spec);
      final withThumbs = await PngCalendarImageRenderer(
        thumbnailLoader: (_) async => thumb,
      ).render(_spec);
      expect(withThumbs, isNot(plain), reason: '썸네일이 있으면 결과가 달라진다');
      final codec = await ui.instantiateImageCodec(withThumbs);
      final frame = await codec.getNextFrame();
      expect(frame.image.width, 1080);
      frame.image.dispose();
      codec.dispose();
    });
  });
}
