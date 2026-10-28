import 'adjustment.dart';
import 'crop_window.dart';
import 'photo_filter.dart';

/// 편집값(플랫폼 공통 모델). 편집기는 이 값만 만들고 실제 픽셀은 업로드 준비 때 원본에서
/// 같은 값으로 다시 그린다(REQ-EDIT-002).
class PhotoEdit {
  const PhotoEdit({
    this.quarterTurns = 0,
    this.crop = CropWindow.full,
    this.filter = PhotoFilter.original,
    this.adjustments = AdjustmentLayers.none,
  });

  /// 편집하지 않은 사진.
  static const PhotoEdit identity = PhotoEdit();

  /// 시계 방향 90도 회전 횟수 0~3.
  final int quarterTurns;
  final CropWindow crop;
  final PhotoFilter filter;
  final AdjustmentLayers adjustments;

  /// 수평 보정 각도. UI가 없으며 항상 0이다(REQ-EDIT-017).
  double get straightenDegrees => 0;

  /// 회전 0, 전체 자르기, 원본 필터, 적용 조정 0이면 편집하지 않은 사진(REQ-EDIT-005).
  /// 업로드 인코더는 이때 편집 재그리기를 건너뛴다(REQ-UPL-028).
  bool get isIdentity =>
      quarterTurns % 4 == 0 &&
      crop.isFull() &&
      filter == PhotoFilter.original &&
      adjustments.isIdentity;

  PhotoEdit copyWith({
    int? quarterTurns,
    CropWindow? crop,
    PhotoFilter? filter,
    AdjustmentLayers? adjustments,
  }) => PhotoEdit(
    quarterTurns: quarterTurns ?? this.quarterTurns,
    crop: crop ?? this.crop,
    filter: filter ?? this.filter,
    adjustments: adjustments ?? this.adjustments,
  );

  @override
  bool operator ==(Object other) =>
      other is PhotoEdit &&
      other.quarterTurns == quarterTurns &&
      other.crop == crop &&
      other.filter == filter &&
      other.adjustments == adjustments;

  @override
  int get hashCode => Object.hash(quarterTurns, crop, filter, adjustments);
}
