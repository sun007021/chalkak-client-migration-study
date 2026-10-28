import 'dart:typed_data';

import 'package:gal/gal.dart';

import '../domain/record_calendar_image.dart';

/// 갤러리 저장 플러그인(`gal`)을 얇게 감싼 경계. 테스트는 이 인터페이스를 Fake로 바꾼다.
abstract interface class GalleryGateway {
  Future<bool> hasAccess();
  Future<bool> requestAccess();

  /// [name]은 확장자 없는 파일 이름이다.
  Future<void> putPng({
    required Uint8List bytes,
    required String name,
    required String album,
  });
}

class GalGalleryGateway implements GalleryGateway {
  const GalGalleryGateway();

  @override
  Future<bool> hasAccess() => Gal.hasAccess();

  @override
  Future<bool> requestAccess() => Gal.requestAccess();

  @override
  Future<void> putPng({
    required Uint8List bytes,
    required String name,
    required String album,
  }) => Gal.putImageBytes(bytes, name: name, album: album);
}

/// Android(MediaStore의 Pictures/Chalkak)와 iOS(사진 추가 권한, Chalkak 앨범)에 PNG를 저장하는
/// [CalendarImageSaver](REQ-REC-037~039). 권한 거부는 [CalendarImagePermissionDenied]로 바꾸고
/// 그 밖의 실패는 그대로 던진다.
class GalleryCalendarImageSaver implements CalendarImageSaver {
  const GalleryCalendarImageSaver({this._gateway = const GalGalleryGateway()});

  final GalleryGateway _gateway;

  static const album = 'Chalkak';

  @override
  Future<void> save({
    required String fileName,
    required Uint8List pngBytes,
  }) async {
    try {
      if (!await _gateway.hasAccess() && !await _gateway.requestAccess()) {
        throw const CalendarImagePermissionDenied();
      }
      await _gateway.putPng(
        bytes: pngBytes,
        name: fileName.endsWith('.png')
            ? fileName.substring(0, fileName.length - '.png'.length)
            : fileName,
        album: album,
      );
    } on GalException catch (error) {
      if (error.type == GalExceptionType.accessDenied) {
        throw const CalendarImagePermissionDenied();
      }
      rethrow;
    }
  }
}
