import 'dart:ui' as ui;

import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/record/data/png_calendar_image_renderer.dart';
import 'package:chalkak/features/record/domain/record_calendar_image.dart';
import 'package:chalkak/features/record/domain/record_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('TC-REC-038 달력을 PNG 시그니처와 0보다 큰 가로세로로 렌더한다', (tester) async {
    await tester.runAsync(() async {
      final bytes = await const PngCalendarImageRenderer().render(
        const RecordCalendarImageSpec(
          month: KstMonth(2026, 10),
          photos: [
            RecordPhoto(
              topicDate: KstDate(2026, 10, 20),
              postId: '22222222-2222-4222-8222-222222222290',
              thumbnailImageUrl: 'https://cdn.example.test/a/thumbnail.webp',
              status: RecordPhotoStatus.approved,
            ),
            RecordPhoto(
              topicDate: KstDate(2026, 10, 27),
              postId: '22222222-2222-4222-8222-222222222201',
              thumbnailImageUrl: 'https://cdn.example.test/b/thumbnail.webp',
              status: RecordPhotoStatus.pending,
            ),
          ],
        ),
      );
      expect(bytes.take(8), [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      expect(frame.image.width, greaterThan(0));
      expect(frame.image.height, greaterThan(0));
      frame.image.dispose();
      codec.dispose();
    });
  });
}
