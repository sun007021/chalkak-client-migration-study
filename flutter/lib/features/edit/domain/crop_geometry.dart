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
  CropWindow largest(double? aspect) => throw UnimplementedError();

  /// 프레임을 (dx, dy) 비율만큼 옮긴다. 사진 밖으로 나가지 않게 가장자리에서 멈춘다.
  CropWindow move(CropWindow crop, double dx, double dy) =>
      throw UnimplementedError();

  /// 모서리를 (dx, dy) 비율만큼 끌어 크기를 바꾼다. 반대편 모서리는 고정이다.
  /// 사진 밖으로 나가지 않고 짧은 변이 [minCropFraction] 아래로 줄지 않는다.
  /// [aspect]가 있으면 가로 / 세로 비율을 유지한다.
  CropWindow dragHandle(
    CropWindow crop,
    CropHandle handle,
    double dx,
    double dy, {
    double? aspect,
  }) => throw UnimplementedError();
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
  double get fitScale => throw UnimplementedError();

  /// 사진이 화면에 보이는 크기.
  Size get displaySize => throw UnimplementedError();

  /// 자르기 화면 크기 = [displaySize] + 양쪽 [handleMargin].
  Size get viewSize => throw UnimplementedError();

  /// 0~1 비율 좌표 -> 화면 좌표([viewSize] 안, 손잡이 여백 포함).
  Offset toScreen(Offset normalized) => throw UnimplementedError();

  /// 화면 좌표 -> 0~1 비율 좌표.
  Offset toNormalized(Offset screen) => throw UnimplementedError();
}
