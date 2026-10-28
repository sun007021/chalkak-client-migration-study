import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

import '../domain/photo_file_store.dart';

/// 앱 임시 폴더에 WebP를 쓰는 [PhotoFileStore]. 파일은 제출 뒤·실패·화면 이탈 때 지운다(REQ-UPL-048).
class TempPhotoFileStore implements PhotoFileStore {
  const TempPhotoFileStore();

  @override
  Future<StoredPhoto> write(Uint8List bytes) async {
    final dir = await getTemporaryDirectory();
    final file = File(
      '${dir.path}/chalkak-upload-${DateTime.now().microsecondsSinceEpoch}.webp',
    );
    await file.writeAsBytes(bytes, flush: true);
    return _TempStoredPhoto(file);
  }
}

class _TempStoredPhoto implements StoredPhoto {
  _TempStoredPhoto(this._file);

  final File _file;

  @override
  String get path => _file.path;

  @override
  Future<Uint8List> readBytes() => _file.readAsBytes();

  @override
  Future<void> delete() async {
    try {
      await _file.delete();
    } on FileSystemException {
      // 이미 지워졌으면 끝난 것이다.
    }
  }
}
