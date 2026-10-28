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
  Future<RgbaImage> render(RgbaImage oriented, PhotoEdit edit) =>
      throw UnimplementedError();
}
