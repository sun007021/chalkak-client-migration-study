import 'dart:async';
import 'dart:typed_data';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/edit/domain/adjustment.dart';
import 'package:chalkak/features/edit/domain/photo_edit.dart';
import 'package:chalkak/features/edit/domain/photo_filter.dart';
import 'package:chalkak/features/upload/domain/photo_picker.dart';
import 'package:chalkak/features/upload/presentation/upload_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/upload_fakes.dart';
import 'upload_vm_driver.dart';

const _edited = PhotoEdit(
  filter: PhotoFilter.mono,
  adjustments: AdjustmentLayers(userValues: {AdjustItem.exposure: 0.5}),
);
const _otherEdit = PhotoEdit(quarterTurns: 1);

void main() {
  group('사진 선택 (REQ-UPL-012~021)', () {
    uploadVmTest('TC-UPL-014 앨범 선택은 즉시 편집기 요청을 내고, 편집을 마치기 전에는 사진이 확정되지 않는다', (
      d,
    ) {
      final bytes = photoBytes(3);
      d.pickAlbum(bytes);
      expect(d.editorRequests, hasLength(1));
      expect(d.editorRequests.single.sourceBytes, bytes);
      expect(d.editorRequests.single.initialEdit, PhotoEdit.identity);
      expect(d.state.photo, isNull);
      expect(d.rig.picker.albumCalls, 1);
    });

    uploadVmTest('TC-UPL-014 선택기를 취소하면 상태를 바꾸지 않는다', (d) {
      d.rig.picker.queueAlbum(Future.value(const PhotoPickCancelled()));
      d.vm.onAlbumPressed();
      d.tick();
      expect(d.editorRequests, isEmpty);
      expect(d.state.photo, isNull);
      expect(d.state.error, isNull);
      expect(d.rig.api.policyCalls, 0);
    });

    uploadVmTest('TC-UPL-015 카메라가 없는 기기는 상태에 isCameraAvailable=false를 담는다', (
      d,
    ) {
      final none = UploadDriver(d.async, cameraAvailable: false);
      expect(none.state.isCameraAvailable, isFalse);
      expect(d.state.isCameraAvailable, isTrue);
      none.dispose();
    });

    uploadVmTest('TC-UPL-016 촬영본은 앨범에 한 번만 저장하고 파일명 규칙을 따른다', (d) {
      d.startScreen();
      final bytes = photoBytes(9);
      d.pickCamera(bytes);
      expect(d.rig.gallery.saved, hasLength(1));
      expect(
        d.rig.gallery.saved.single.fileName,
        matches(RegExp(r'^chalkak-photo-.+\.jpg$')),
      );
      expect(d.rig.gallery.saved.single.bytes, bytes);
      d.completeEdit();
      d.submit();
      expect(d.rig.gallery.saved, hasLength(1), reason: '전시하기에서 다시 저장하지 않는다');
      expect(d.editorRequests, hasLength(1));
    });

    uploadVmTest('TC-UPL-017 앨범에서 고른 사진은 앨범에 저장하지 않는다', (d) {
      d.startScreen();
      d.pickAndComplete();
      d.submit();
      expect(d.rig.gallery.saved, isEmpty);
    });

    uploadVmTest('TC-UPL-018 촬영본 저장이 실패하면 토스트만 띄우고 선택한 사진으로 업로드를 계속할 수 있다', (
      d,
    ) {
      d.rig.gallery.error = StateError('permission denied');
      d.pickCamera();
      expect(d.rig.toast.messages, [Copy.uploadCameraSaveFailed]);
      expect(d.editorRequests, hasLength(1), reason: '편집기는 그대로 열린다');
      expect(d.state.error, isNull);
      d.completeEdit();
      expect(d.state.photo, isNotNull);
      expect(d.state.preparation, PreparationStatus.ready);
      d.submit();
      expect(d.events.whereType<UploadSucceeded>(), hasLength(1));
      expect(d.rig.toast.messages, hasLength(1));
    });

    uploadVmTest('TC-UPL-019 화면을 닫은 뒤 늦게 끝난 저장 실패도 전역 토스트로 알린다', (d) {
      d.startScreen();
      final gate = Completer<void>();
      d.rig.gallery
        ..gate = gate.future
        ..error = StateError('late failure');
      d.pickCamera();
      d.dispose();
      expect(d.rig.toast.messages, isEmpty);
      gate.complete();
      d.tick();
      expect(d.rig.toast.messages, [Copy.uploadCameraSaveFailed]);
    });

    uploadVmTest('TC-UPL-020 사진 A 로딩 중 B를 고르면 최신 선택(B)만 반영한다', (d) {
      final a = Completer<PickResult>();
      final b = Completer<PickResult>();
      d.rig.picker
        ..queueAlbum(a.future)
        ..queueAlbum(b.future);
      final bytesA = photoBytes(10);
      final bytesB = photoBytes(20);
      d.vm.onAlbumPressed();
      d.vm.onAlbumPressed();
      b.complete(FakePhotoPicker.album(bytesB));
      d.tick();
      a.complete(FakePhotoPicker.album(bytesA));
      d.tick();
      expect(d.editorRequests, hasLength(1));
      expect(d.editorRequests.single.sourceBytes, bytesB);
    });

    uploadVmTest('TC-UPL-021 빈 데이터는 편집기를 열지 않고 사진 준비 실패 문구를 보여 준다', (d) {
      d.pickAlbum(Uint8List(0));
      expect(d.editorRequests, isEmpty);
      expect(d.state.error, Copy.uploadErrorPrepare);
      expect(d.state.photo, isNull);
    });

    uploadVmTest('TC-UPL-021 손상된 사진도 편집기를 열지 않는다', (d) {
      d.rig.decoder.isCorrupt = (b) => b.length == 5;
      d.pickAlbum(Uint8List.fromList([1, 2, 3, 4, 5]));
      expect(d.editorRequests, isEmpty);
      expect(d.state.error, Copy.uploadErrorPrepare);
    });
  });

  group('편집 결과 처리 (REQ-UPL-025, 035, EDIT-003~005)', () {
    uploadVmTest('TC-UPL-023 편집을 마치면 곧바로 정책 발급과 인코딩을 시작하고 S3로는 보내지 않는다', (d) {
      d.pickAndComplete(edit: _edited);
      expect(d.state.photo, isNotNull);
      expect(d.state.edit, _edited);
      expect(d.rig.api.policyCalls, 1);
      expect(d.rig.api.putCalls, 0);
      expect(d.rig.api.createCalls, 0);
      expect(d.state.preparation, PreparationStatus.ready);
      expect(d.rig.compressor.calls, isNotEmpty);
    });

    uploadVmTest('TC-EDIT-004 처음 고른 사진의 편집을 취소하면 사진이 선택되지 않는다', (d) {
      d.pickAlbum();
      d.vm.onEditCancelled();
      d.tick();
      expect(d.state.photo, isNull);
      expect(d.state.preparation, PreparationStatus.none);
      expect(d.rig.api.policyCalls, 0);
      expect(d.state.canSubmit, isFalse);
    });

    uploadVmTest('TC-EDIT-005 다시 편집하다 취소하면 이전 선택·편집·준비 결과가 유지된다', (d) {
      d.pickAndComplete(edit: _edited);
      final photo = d.state.photo;
      d.vm.onPhotoTapped();
      d.tick();
      d.vm.onEditCancelled();
      d.tick();
      expect(d.state.photo, same(photo));
      expect(d.state.edit, _edited);
      expect(d.state.preparation, PreparationStatus.ready);
      expect(d.rig.api.policyCalls, 1);
      expect(d.rig.files.live, 1);
    });

    uploadVmTest('TC-EDIT-006 사진을 탭하면 현재 편집값으로 편집기를 다시 연다', (d) {
      d.pickAndComplete(edit: _edited);
      d.vm.onPhotoTapped();
      d.tick();
      final request = d.editorRequests.last;
      expect(d.editorRequests, hasLength(2));
      expect(request.initialEdit, _edited);
      expect(request.sourceBytes, isNotEmpty);
    });

    uploadVmTest(
      'TC-EDIT-006 TC-UPL-028 다른 편집값으로 다시 완료하면 이전 준비를 취소·삭제하고 새 정책으로 준비한다',
      (d) {
        d.pickAndComplete(edit: _edited);
        final first = d.rig.files.files.single;
        d.vm.onPhotoTapped();
        d.tick();
        d.completeEdit(_otherEdit);
        expect(first.deleted, isTrue);
        expect(d.rig.api.policyCalls, 2);
        expect(d.rig.files.live, 1);
        expect(d.state.edit, _otherEdit);
      },
    );

    uploadVmTest('TC-EDIT-006 TC-UPL-028 같은 편집값으로 다시 완료하면 다시 준비하지 않는다', (d) {
      d.pickAndComplete(edit: _edited);
      d.vm.onPhotoTapped();
      d.tick();
      d.completeEdit(_edited);
      expect(d.rig.api.policyCalls, 1);
      expect(d.rig.files.files, hasLength(1));
      expect(d.rig.files.live, 1);
    });

    uploadVmTest('TC-UPL-028 다른 사진으로 교체하면 이전 임시 파일을 삭제하고 새 정책을 발급한다', (d) {
      d.pickAndComplete(bytes: photoBytes(1));
      final first = d.rig.files.files.single;
      d.pickAndComplete(bytes: photoBytes(2));
      expect(first.deleted, isTrue);
      expect(d.rig.api.policyCalls, 2);
      expect(d.rig.files.live, 1);
    });
  });

  group('준비 상태 (REQ-UPL-034, 036, 037)', () {
    uploadVmTest('TC-UPL-029 준비가 실패하면 사진·제목을 유지한 채 즉시 실패를 알린다', (d) {
      d.rig.api.policy(['posts-uploads__500-server-error.json']);
      d.vm.onTitleChanged('가을');
      d.pickAndComplete();
      d.tick(const Duration(seconds: 5));
      expect(d.state.preparation, PreparationStatus.failed);
      expect(d.state.error, Copy.uploadErrorPrepare);
      expect(d.state.photo, isNotNull);
      expect(d.state.title, '가을');
    });

    uploadVmTest('TC-UPL-029 준비 실패 뒤 전시하기가 정책 발급과 준비부터 다시 시도한다', (d) {
      d.startScreen();
      d.rig.api.policy([
        'posts-uploads__500-server-error.json',
        'posts-uploads__500-server-error.json',
        'posts-uploads__500-server-error.json',
        'posts-uploads__issued.json',
      ]);
      d.pickAndComplete();
      d.tick(const Duration(seconds: 5));
      expect(d.state.preparation, PreparationStatus.failed);
      d.submit();
      expect(d.events.whereType<UploadSucceeded>(), hasLength(1));
      expect(d.rig.api.policyCalls, 4);
    });

    uploadVmTest('TC-UPL-030 뒤늦게 끝난 이전 준비가 새 선택의 상태를 덮지 않고 이전 파일은 지워진다', (d) {
      d.rig.api.policyResponses([
        up('posts-uploads__issued.json', delay: const Duration(seconds: 6)),
        up('posts-uploads__issued-new.json'),
      ]);
      d.pickAndComplete(bytes: photoBytes(1));
      d.pickAndComplete(bytes: photoBytes(2));
      d.tick(const Duration(seconds: 10));
      expect(d.state.preparation, PreparationStatus.ready);
      expect(d.rig.files.live, 1);
      expect(d.rig.files.files.where((f) => !f.deleted), hasLength(1));
    });

    uploadVmTest('TC-UPL-031 화면을 닫으면 진행 중 준비를 취소하고 임시 파일을 지운다', (d) {
      d.pickAndComplete();
      expect(d.rig.files.live, 1);
      d.dispose();
      expect(d.rig.files.live, 0);
    });

    uploadVmTest('TC-UPL-031 정책 발급 중 화면을 닫으면 파일을 만들지 않는다', (d) {
      d.rig.api.policy([
        'posts-uploads__issued.json',
      ], delay: const Duration(seconds: 5));
      d.pickAndComplete();
      d.dispose();
      d.tick(const Duration(seconds: 10));
      expect(d.rig.files.live, 0);
      expect(d.events.whereType<UploadSucceeded>(), isEmpty);
    });

    uploadVmTest('TC-UPL-047 사진이 없으면 전시하기는 비활성, 사진을 고르면 준비 상태와 무관하게 활성이다', (d) {
      expect(d.state.canSubmit, isFalse);
      d.rig.api.policy([
        'posts-uploads__issued.json',
      ], delay: const Duration(seconds: 5));
      d.pickAlbum();
      d.completeEdit();
      expect(d.state.preparation, PreparationStatus.preparing);
      expect(d.state.canSubmit, isTrue);
    });

    uploadVmTest('TC-UPL-047 준비 실패 후에도 다시 제출할 수 있다', (d) {
      d.rig.api.policy(['posts-uploads__500-server-error.json']);
      d.pickAndComplete();
      d.tick(const Duration(seconds: 5));
      expect(d.state.preparation, PreparationStatus.failed);
      expect(d.state.canSubmit, isTrue);
    });
  });

  group('제목 입력 (REQ-UPL-022~024)', () {
    uploadVmTest('TC-UPL-080 한글 10자와 이모지 10개는 허용하고 11번째 입력은 받지 않는다', (d) {
      var typed = '';
      for (final ch in '가나다라마바사아자차'.runes) {
        typed += String.fromCharCode(ch);
        d.vm.onTitleChanged(typed);
      }
      expect(d.state.title, '가나다라마바사아자차');
      d.vm.onTitleChanged('${d.state.title}카');
      expect(d.state.title, '가나다라마바사아자차');

      d.vm.onTitleChanged('');
      var emojis = '';
      for (var i = 0; i < 10; i++) {
        emojis += '😀';
        d.vm.onTitleChanged(emojis);
      }
      expect(d.state.title.runes.length, 10);
      d.vm.onTitleChanged('${d.state.title}😀');
      expect(d.state.title.runes.length, 10);
    });

    uploadVmTest(
      'TC-UPL-081 결합 이모지 2개(10 code point) 뒤 한 글자와 11자 붙여넣기는 10 code point까지만 받는다',
      (d) {
        const family = '👨‍👩‍👧';
        const two = '$family$family';
        d.vm.onTitleChanged(two);
        expect(d.state.title.runes.length, 10);
        d.vm.onTitleChanged('$two가');
        expect(d.state.title, two);

        d.vm.onTitleChanged('');
        d.vm.onTitleChanged('가나다라마바사아자차카');
        expect(d.state.title, '가나다라마바사아자차');
      },
    );
  });
}
