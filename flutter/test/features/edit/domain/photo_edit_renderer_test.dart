import 'package:chalkak/features/edit/domain/adjustment.dart';
import 'package:chalkak/features/edit/domain/crop_window.dart';
import 'package:chalkak/features/edit/domain/photo_edit.dart';
import 'package:chalkak/features/edit/domain/photo_edit_renderer.dart';
import 'package:chalkak/features/edit/domain/photo_filter.dart';
import 'package:chalkak/features/edit/domain/rgba_image.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/upload_fakes.dart' show pixelImage;

const _renderer = PixelPhotoEditRenderer();

/// 4x4 입력: (x, y)의 색은 (60x+20, 50y+30, 100+10(x+y)).
RgbaImage _input() =>
    pixelImage(4, 4, (x, y) => [60 * x + 20, 50 * y + 30, 100 + 10 * (x + y)]);

List<int> _srcPixel(int x, int y) => [
  60 * x + 20,
  50 * y + 30,
  100 + 10 * (x + y),
  255,
];

void main() {
  group('렌더링', () {
    test(
      'TC-EDIT-046 회전 1회 + 왼쪽 절반 자르기 + 노출 .5 + 흑백 4x4 통합: 출력 2x4와 픽셀이 골든과 같다',
      () async {
        const edit = PhotoEdit(
          quarterTurns: 1,
          // 돌린 사진의 왼쪽 절반: 원본 기준 중심 (0.5, 0.75), 크기 0.5 x 1.
          crop: CropWindow(centerX: 0.5, centerY: 0.75, width: 0.5, height: 1),
          filter: PhotoFilter.mono,
          adjustments: AdjustmentLayers(userValues: {AdjustItem.exposure: 0.5}),
        );
        final out = await _renderer.render(_input(), edit);
        expect((out.width, out.height), (2, 4));

        // 행 j(위에서부터), 열 i. 값은 R=G=B(±2). 파이썬으로 스펙 식을 옮겨 구한 골든이다.
        const golden = [
          [160, 123],
          [184, 146],
          [208, 170],
          [232, 194],
        ];
        for (var j = 0; j < 4; j++) {
          for (var i = 0; i < 2; i++) {
            final p = out.pixelAt(i, j);
            expect(p[0], closeTo(golden[j][i], 2), reason: '($i, $j) R');
            expect(p[1], p[0], reason: '($i, $j) G=R');
            expect(p[2], p[0], reason: '($i, $j) B=R');
            expect(p[3], 255);
          }
        }
      },
    );

    test(
      'REQ-EDIT-008 TC-EDIT-046 색 조정이 없으면 기하만 반영한다: 시계 방향 1회전의 왼쪽 위는 원본 왼쪽 아래다',
      () async {
        final out = await _renderer.render(
          _input(),
          const PhotoEdit(quarterTurns: 1),
        );
        expect((out.width, out.height), (4, 4));
        // 돌린 사진 (i, j) <- 원본 (x = j, y = 3 - i)
        for (var j = 0; j < 4; j++) {
          for (var i = 0; i < 4; i++) {
            expect(out.pixelAt(i, j), _srcPixel(j, 3 - i), reason: '($i, $j)');
          }
        }
      },
    );

    test('REQ-EDIT-008 2회전은 180도, 4회전 효과(0회전)는 원본 그대로다', () async {
      final r2 = await _renderer.render(
        _input(),
        const PhotoEdit(quarterTurns: 2),
      );
      for (var y = 0; y < 4; y++) {
        for (var x = 0; x < 4; x++) {
          expect(r2.pixelAt(x, y), _srcPixel(3 - x, 3 - y));
        }
      }
      final r0 = await _renderer.render(_input(), const PhotoEdit());
      expect(r0.rgba, _input().rgba);
    });

    test('TC-EDIT-011 편집하지 않은 값으로 불러도 같은 픽셀을 돌려준다', () async {
      final out = await _renderer.render(_input(), PhotoEdit.identity);
      expect((out.width, out.height), (4, 4));
      expect(out.rgba, _input().rgba);
    });

    test('REQ-EDIT-004 자르기만 한 결과 크기는 자르기 비율 x 돌린 사진 크기다', () async {
      final out = await _renderer.render(
        _input(),
        const PhotoEdit(
          crop: CropWindow(centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5),
        ),
      );
      expect((out.width, out.height), (2, 2));
      expect(out.pixelAt(0, 0), _srcPixel(1, 1));
      expect(out.pixelAt(1, 1), _srcPixel(2, 2));
    });
  });
}
