import 'dart:ui' show Offset, Size;

import 'crop_window.dart';

/// 자르기 프레임을 끄는 모서리.
enum CropHandle { topLeft, topRight, bottomLeft, bottomRight }

/// 자르기 프레임 기하(REQ-EDIT-011~013). 좌표는 "돌린 사진" 기준 0~1 비율이다
/// (이 클래스는 90도 돌린 뒤의 사진 가로세로 [imageWidth] x [imageHeight] px를 안다).
/// [CropWindow.centerX]/[CropWindow.centerY]도 이 클래스 안에서는 돌린 사진 기준 비율로 읽는다.
class CropGeometry {
  const CropGeometry({required this.imageWidth, required this.imageHeight});

  /// 짧은 변의 최소 크기 비율(사진 짧은 변의 0.1배).
  static const double minCropFraction = 0.1;

  final double imageWidth;
  final double imageHeight;

  /// 가로 / 세로 비율이 [aspect]인, 사진 안에서 가장 크고 가운데에 놓인 영역.
  /// [aspect]가 null이면 전체.
  CropWindow largest(double? aspect) {
    if (aspect == null) return CropWindow.full;
    // 사진 안의 px 크기. 가로를 다 쓰는 쪽과 세로를 다 쓰는 쪽 중 들어가는 쪽.
    var w = imageWidth;
    var h = w / aspect;
    if (h > imageHeight) {
      h = imageHeight;
      w = h * aspect;
    }
    return CropWindow(
      centerX: 0.5,
      centerY: 0.5,
      width: w / imageWidth,
      height: h / imageHeight,
    );
  }

  /// 프레임을 (dx, dy) 비율만큼 옮긴다. 사진 밖으로 나가지 않게 가장자리에서 멈춘다.
  CropWindow move(CropWindow crop, double dx, double dy) {
    final cx = (crop.centerX + dx).clamp(crop.width / 2, 1 - crop.width / 2);
    final cy = (crop.centerY + dy).clamp(crop.height / 2, 1 - crop.height / 2);
    return CropWindow(
      centerX: cx.toDouble(),
      centerY: cy.toDouble(),
      width: crop.width,
      height: crop.height,
    );
  }

  /// 모서리를 (dx, dy) 비율만큼 끌어 크기를 바꾼다. 반대편 모서리는 고정이다.
  /// 사진 밖으로 나가지 않고 짧은 변이 [minCropFraction] 아래로 줄지 않는다.
  /// [aspect]가 있으면 가로 / 세로 비율을 유지한다.
  CropWindow dragHandle(
    CropWindow crop,
    CropHandle handle,
    double dx,
    double dy, {
    double? aspect,
  }) {
    final left = crop.centerX - crop.width / 2;
    final right = crop.centerX + crop.width / 2;
    final top = crop.centerY - crop.height / 2;
    final bottom = crop.centerY + crop.height / 2;
    final movesLeft =
        handle == CropHandle.topLeft || handle == CropHandle.bottomLeft;
    final movesTop =
        handle == CropHandle.topLeft || handle == CropHandle.topRight;
    // 고정되는 반대편 모서리(비율 좌표).
    final anchorX = movesLeft ? right : left;
    final anchorY = movesTop ? bottom : top;
    // 끄는 모서리의 새 위치.
    final dragX = (movesLeft ? left : right) + dx;
    final dragY = (movesTop ? top : bottom) + dy;

    // 앵커에서 끄는 쪽으로 가는 방향과, 사진 가장자리까지 쓸 수 있는 최대 px 크기.
    final signX = movesLeft ? -1.0 : 1.0;
    final signY = movesTop ? -1.0 : 1.0;
    final maxW = (movesLeft ? anchorX : 1 - anchorX) * imageWidth;
    final maxH = (movesTop ? anchorY : 1 - anchorY) * imageHeight;
    final minSide =
        minCropFraction * (imageWidth < imageHeight ? imageWidth : imageHeight);

    // 요청한 px 크기(앵커 반대 방향으로 뒤집히면 0 취급).
    final wantW = ((dragX - anchorX) * signX * imageWidth).clamp(0.0, maxW);
    final wantH = ((dragY - anchorY) * signY * imageHeight).clamp(0.0, maxH);

    double w;
    double h;
    if (aspect == null) {
      w = wantW.clamp(minSide < maxW ? minSide : maxW, maxW).toDouble();
      h = wantH.clamp(minSide < maxH ? minSide : maxH, maxH).toDouble();
    } else {
      // 비율선 위로 끌린 위치를 투영한다.
      var hh = (aspect * wantW + wantH) / (aspect * aspect + 1);
      // 쓸 수 있는 최대와 최소(짧은 변 >= minSide).
      final maxHeight = maxH < maxW / aspect ? maxH : maxW / aspect;
      final minHeight = aspect >= 1 ? minSide : minSide / aspect;
      hh = hh.clamp(minHeight < maxHeight ? minHeight : maxHeight, maxHeight);
      h = hh;
      w = hh * aspect;
    }

    final newW = w / imageWidth;
    final newH = h / imageHeight;
    final newLeft = signX > 0 ? anchorX : anchorX - newW;
    final newTop = signY > 0 ? anchorY : anchorY - newH;
    return CropWindow(
      centerX: newLeft + newW / 2,
      centerY: newTop + newH / 2,
      width: newW,
      height: newH,
    );
  }
}

/// 화면 좌표 <-> 중심 단위 좌표(0~1) 변환과 자르기 화면 크기(REQ-EDIT-013, TC-EDIT-019).
class CropViewport {
  const CropViewport({
    required this.imageSize,
    required this.boxSize,
    this.handleMargin = 0,
  });

  /// 돌린 사진의 px 크기.
  final Size imageSize;

  /// 사진을 보여 줄 수 있는 상자 크기.
  final Size boxSize;

  /// 모서리 손잡이를 위해 사진 둘레에 더하는 여백.
  final double handleMargin;

  /// 사진이 [boxSize] 안에 들어가도록 줄이는 배율(확대하지 않는다).
  double get fitScale {
    final s = [
      boxSize.width / imageSize.width,
      boxSize.height / imageSize.height,
      1.0,
    ].reduce((a, b) => a < b ? a : b);
    return s;
  }

  /// 사진이 화면에 보이는 크기.
  Size get displaySize =>
      Size(imageSize.width * fitScale, imageSize.height * fitScale);

  /// 자르기 화면 크기 = [displaySize] + 양쪽 [handleMargin].
  Size get viewSize => Size(
    displaySize.width + handleMargin * 2,
    displaySize.height + handleMargin * 2,
  );

  /// 0~1 비율 좌표 -> 화면 좌표([viewSize] 안, 손잡이 여백 포함).
  Offset toScreen(Offset normalized) => Offset(
    handleMargin + normalized.dx * displaySize.width,
    handleMargin + normalized.dy * displaySize.height,
  );

  /// 화면 좌표 -> 0~1 비율 좌표.
  Offset toNormalized(Offset screen) => Offset(
    (screen.dx - handleMargin) / displaySize.width,
    (screen.dy - handleMargin) / displaySize.height,
  );
}
