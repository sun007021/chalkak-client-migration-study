import 'dart:math' show Point;

import 'crop_window.dart';

/// 90도 회전과 자르기를 원본 좌표로 옮기는 계산(REQ-EDIT-014, 018, 부록).
abstract final class PhotoTransform {
  /// 돌린 사진의 점 (xr, yr)을 원본 W x H의 점으로:
  /// 0회전 (xr, yr), 1회전 (yr, H - xr), 2회전 (W - xr, H - yr), 3회전 (W - yr, xr).
  static Point<double> toSource(
    int quarterTurns,
    double xr,
    double yr, {
    required int sourceWidth,
    required int sourceHeight,
  }) => throw UnimplementedError();

  /// 90도씩 돌린 사진의 크기(홀수 회전이면 가로세로가 바뀐다).
  static ({int width, int height}) rotatedSize(
    int quarterTurns, {
    required int sourceWidth,
    required int sourceHeight,
  }) => throw UnimplementedError();

  /// 돌린 사진 위의 사각형(중심 px, 크기 0~1 비율)을 편집값 [CropWindow]로 바꾼다.
  /// 중심은 원본 비율로 변환되고 크기는 돌린 사진 비율 그대로다.
  static CropWindow cropFromRotated(
    int quarterTurns, {
    required int sourceWidth,
    required int sourceHeight,
    required double rotatedCenterX,
    required double rotatedCenterY,
    required double widthFraction,
    required double heightFraction,
  }) => throw UnimplementedError();

  /// 자르기·회전을 마친 결과 크기(px, 반올림).
  static ({int width, int height}) outputSize(
    int quarterTurns,
    CropWindow crop, {
    required int sourceWidth,
    required int sourceHeight,
  }) => throw UnimplementedError();
}
