import 'dart:typed_data';

import 'package:gal/gal.dart';

import '../domain/gallery_saver.dart';

/// 촬영본을 `gal`로 기기 앨범에 저장하는 [GallerySaver]. 권한을 먼저 확인·요청하고
/// 거부되면 예외를 던진다(ViewModel이 토스트로 알린다).
class GalGallerySaver implements GallerySaver {
  const GalGallerySaver();

  @override
  Future<void> saveJpeg(Uint8List bytes, {required String fileName}) async {
    if (!await Gal.hasAccess() && !await Gal.requestAccess()) {
      throw StateError('gallery permission denied');
    }
    await Gal.putImageBytes(
      bytes,
      name: fileName.replaceAll(RegExp(r'\.jpg$'), ''),
    );
  }
}
