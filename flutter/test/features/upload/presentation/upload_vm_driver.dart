import 'dart:async';
import 'dart:typed_data';

import 'package:chalkak/features/edit/domain/photo_edit.dart';
import 'package:chalkak/features/upload/presentation/upload_view_model.dart';
import 'package:fake_async/fake_async.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, settle;
import '../../../support/upload_fakes.dart';

/// 업로드 ViewModel 테스트 보조: 가상 시간을 흘리며 선택 -> 편집 완료 -> 제출을 진행한다.
class UploadDriver {
  UploadDriver(this.async, {bool cameraAvailable = true}) : rig = UploadRig() {
    vm = rig.makeViewModel(cameraAvailable: cameraAvailable);
  }

  final FakeAsync async;
  final UploadRig rig;
  late final UploadViewModel vm;

  UploadState get state => vm.state;
  List<UploadEvent> get events => rig.events;

  Iterable<OpenPhotoEditor> get editorRequests =>
      rig.events.whereType<OpenPhotoEditor>();

  void tick([Duration d = const Duration(seconds: 1)]) => advance(async, d);

  void startScreen() {
    vm.start();
    tick();
  }

  /// 앨범에서 [bytes]를 고르고(편집기 요청까지) 진행한다.
  void pickAlbum([Uint8List? bytes]) {
    rig.picker.queueAlbum(
      Future.value(FakePhotoPicker.album(bytes ?? photoBytes())),
    );
    vm.onAlbumPressed();
    tick();
  }

  void pickCamera([Uint8List? bytes]) {
    rig.picker.queueCamera(
      Future.value(FakePhotoPicker.camera(bytes ?? photoBytes())),
    );
    vm.onCameraPressed();
    tick();
  }

  /// 편집기에서 [edit]로 완료한 것으로 알린다.
  void completeEdit([PhotoEdit edit = PhotoEdit.identity]) {
    vm.onEditCompleted(edit, sizedImage(40, 30));
    tick();
  }

  /// 앨범 선택 -> 편집 완료까지 한 번에.
  void pickAndComplete({
    Uint8List? bytes,
    PhotoEdit edit = PhotoEdit.identity,
  }) {
    pickAlbum(bytes);
    completeEdit(edit);
  }

  void submit([Duration wait = const Duration(seconds: 30)]) {
    vm.onSubmitPressed();
    tick(wait);
  }

  T lastEvent<T extends UploadEvent>() => rig.events.whereType<T>().last;

  bool _disposed = false;

  /// 두 번 불러도 안전하다(테스트가 중간에 화면을 닫는 경우).
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    vm.dispose();
    settle(async);
  }
}

void uploadVmTest(String name, void Function(UploadDriver d) body) {
  fakeTest(name, (async) {
    final d = UploadDriver(async);
    body(d);
    d.dispose();
  });
}
