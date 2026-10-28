import 'dart:typed_data';

import 'color_pipeline.dart';
import 'photo_filter.dart';
import 'photo_transform.dart';
import 'photo_edit.dart';
import 'rgba_image.dart';

/// 편집값을 픽셀에 반영한다. 순서: 자르기·회전 -> 색 조정 -> 필터(REQ-EDIT-008).
/// 편집기 완료와 업로드 인코더가 같은 구현을 쓴다(REQ-EDIT-002, 009).
abstract interface class PhotoEditRenderer {
  /// [oriented]는 EXIF 방향을 반영한 이미지. [PhotoEdit.isIdentity]면 호출하지 않는 것이 규칙이지만
  /// 호출돼도 [oriented]와 같은 픽셀을 돌려준다. 실패하면 예외를 던진다.
  Future<RgbaImage> render(RgbaImage oriented, PhotoEdit edit);
}

/// 순수 Dart 픽셀 연산으로 렌더링한다.
class PixelPhotoEditRenderer implements PhotoEditRenderer {
  const PixelPhotoEditRenderer();

  @override
  Future<RgbaImage> render(RgbaImage oriented, PhotoEdit edit) async {
    final turns = edit.quarterTurns % 4;
    final w = oriented.width;
    final h = oriented.height;
    final rotated = PhotoTransform.rotatedSize(
      turns,
      sourceWidth: w,
      sourceHeight: h,
    );
    final out = PhotoTransform.outputSize(
      turns,
      edit.crop,
      sourceWidth: w,
      sourceHeight: h,
    );
    final outW = out.width.clamp(1, rotated.width);
    final outH = out.height.clamp(1, rotated.height);

    // 자르기 중심(회전 전 원본 비율)을 돌린 사진의 px 좌표로 옮긴다.
    final sx = edit.crop.centerX * w;
    final sy = edit.crop.centerY * h;
    final (rcx, rcy) = switch (turns) {
      1 => (h - sy, sx),
      2 => (w - sx, h - sy),
      3 => (sy, w - sx),
      _ => (sx, sy),
    };
    final left = (rcx - rotated.width * edit.crop.width / 2).round().clamp(
      0,
      rotated.width - outW,
    );
    final top = (rcy - rotated.height * edit.crop.height / 2).round().clamp(
      0,
      rotated.height - outH,
    );

    final src = oriented.rgba;
    final dst = Uint8List(outW * outH * 4);
    for (var j = 0; j < outH; j++) {
      final yr = top + j;
      for (var i = 0; i < outW; i++) {
        final xr = left + i;
        final int x;
        final int y;
        switch (turns) {
          case 1:
            x = yr;
            y = h - 1 - xr;
          case 2:
            x = w - 1 - xr;
            y = h - 1 - yr;
          case 3:
            x = w - 1 - yr;
            y = xr;
          default:
            x = xr;
            y = yr;
        }
        final so = (y * w + x) * 4;
        final d = (j * outW + i) * 4;
        dst[d] = src[so];
        dst[d + 1] = src[so + 1];
        dst[d + 2] = src[so + 2];
        dst[d + 3] = src[so + 3];
      }
    }
    final geometric = RgbaImage(width: outW, height: outH, rgba: dst);
    final adjustments = edit.adjustments.effectiveValues;
    if (adjustments.isZero && edit.filter == PhotoFilter.original) {
      return geometric;
    }
    return PhotoColorPipeline.apply(
      geometric,
      adjustments: adjustments,
      filter: edit.filter,
    );
  }
}
