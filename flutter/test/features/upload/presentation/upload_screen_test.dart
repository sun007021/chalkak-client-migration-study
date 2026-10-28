import 'dart:typed_data';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/edit/presentation/photo_edit_test_ids.dart';
import 'package:chalkak/features/edit/presentation/photo_edit_view_model.dart';
import 'package:chalkak/features/upload/presentation/upload_screen.dart';
import 'package:chalkak/features/upload/presentation/upload_test_ids.dart';
import 'package:chalkak/features/upload/presentation/upload_view_model.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart'
    show byId, pumpScreen, settleUi, widgetTest;
import '../../../support/fixtures.dart';
import '../../../support/ui_helpers.dart' show isEnabled;
import '../../../support/upload_fakes.dart';

class _Screen {
  _Screen(this.rig, this.vm, this.events);
  final UploadRig rig;
  final UploadViewModel vm;
  final List<UploadEvent> events;
}

Future<_Screen> _open(
  WidgetTester tester, {
  bool camera = true,
  void Function(UploadRig rig)? script,
}) async {
  final rig = UploadRig();
  script?.call(rig);
  final vm = rig.makeViewModel(cameraAvailable: camera);
  addTearDown(vm.dispose);
  final events = <UploadEvent>[];
  await pumpScreen(
    tester,
    UploadScreen(
      viewModel: vm,
      editorFactory: (request) => PhotoEditViewModel(
        sourceBytes: request.sourceBytes,
        initial: request.initialEdit,
        loader: FakeEditSourceLoader(),
        renderer: FakePhotoEditRenderer(),
        analyzer: FakeAutoAnalyzer(),
      ),
      onEvent: events.add,
    ),
  );
  await settleUi(tester, frames: 20);
  return _Screen(rig, vm, events);
}

Future<void> _pickAndFinishEdit(WidgetTester tester, _Screen s) async {
  s.rig.picker.queueAlbum(Future.value(FakePhotoPicker.album(photoBytes())));
  await tester.tap(byId(UploadTestIds.albumButton));
  await settleUi(tester, frames: 20);
  await tester.tap(byId(PhotoEditTestIds.doneButton));
  await settleUi(tester, frames: 30);
}

String _topicTitle() =>
    ((Fixture.load('home/topics__open-2026-10-27.json') as Map)['title']!)
        as String;

void main() {
  widgetTest('TC-UPL-089 화면 문구: 주제 안내·보조 문구·제목 플레이스홀더·상단 제목', (tester) async {
    await _open(tester);
    expect(byId(UploadTestIds.root), findsOneWidget);
    expect(
      find.descendant(
        of: byId(UploadTestIds.topicTitle),
        matching: find.text(
          Copy.fill(Copy.uploadHeading, {'주제': _topicTitle()}),
        ),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: byId(UploadTestIds.guideText),
        matching: find.text(Copy.uploadSubheading),
      ),
      findsOneWidget,
    );
    expect(find.text(Copy.uploadCaptionPlaceholder), findsOneWidget);
    expect(find.text(Copy.uploadTitle), findsWidgets);
    expect(byId(UploadTestIds.closeButton), findsOneWidget);
    expect(byId(UploadTestIds.titleInput), findsOneWidget);
    expect(byId(UploadTestIds.titleCounter), findsOneWidget);
  });

  widgetTest('TC-UPL-089 testID가 Semantics identifier로도 노출된다', (tester) async {
    final handle = tester.ensureSemantics();
    await _open(tester);
    for (final id in [
      UploadTestIds.root,
      UploadTestIds.closeButton,
      UploadTestIds.topicTitle,
      UploadTestIds.guideText,
      UploadTestIds.albumButton,
      UploadTestIds.cameraButton,
      UploadTestIds.titleInput,
      UploadTestIds.submitButton,
    ]) {
      expect(find.bySemanticsIdentifier(id), findsOneWidget, reason: id);
    }
    handle.dispose();
  });

  widgetTest('TC-UPL-089 제목 입력에 포커스를 줄 수 있다', (tester) async {
    await _open(tester);
    await tester.tap(byId(UploadTestIds.titleInput));
    await settleUi(tester);
    final field = tester.widget<EditableText>(find.byType(EditableText).first);
    expect(field.focusNode.hasFocus, isTrue);
  });

  widgetTest('TC-UPL-015 카메라를 쓸 수 없으면 카메라 버튼이 숨고 앨범 선택은 가능하다', (tester) async {
    await _open(tester, camera: false);
    expect(byId(UploadTestIds.cameraButton), findsNothing);
    expect(byId(UploadTestIds.albumButton), findsOneWidget);
  });

  widgetTest('TC-UPL-015 카메라가 있으면 카메라 버튼이 보인다', (tester) async {
    await _open(tester);
    expect(byId(UploadTestIds.cameraButton), findsOneWidget);
  });

  widgetTest('TC-UPL-014 앨범 버튼을 누르면 선택 즉시 편집기가 열린다', (tester) async {
    final s = await _open(tester);
    s.rig.picker.queueAlbum(Future.value(FakePhotoPicker.album(photoBytes())));
    await tester.tap(byId(UploadTestIds.albumButton));
    await settleUi(tester, frames: 20);
    expect(byId(PhotoEditTestIds.root), findsOneWidget);
    expect(s.rig.picker.albumCalls, 1);
  });

  widgetTest('TC-UPL-014 선택기를 취소하면 화면이 그대로이다', (tester) async {
    final s = await _open(tester);
    await tester.tap(byId(UploadTestIds.albumButton));
    await settleUi(tester, frames: 20);
    expect(byId(PhotoEditTestIds.root), findsNothing);
    expect(byId(UploadTestIds.albumButton), findsOneWidget);
    expect(s.vm.state.photo, isNull);
  });

  widgetTest('TC-UPL-021 빈 사진은 편집기를 열지 않고 준비 실패 문구를 보여 준다', (tester) async {
    final s = await _open(tester);
    s.rig.picker.queueAlbum(Future.value(FakePhotoPicker.album(Uint8List(0))));
    await tester.tap(byId(UploadTestIds.albumButton));
    await settleUi(tester, frames: 20);
    expect(byId(PhotoEditTestIds.root), findsNothing);
    expect(
      find.descendant(
        of: byId(UploadTestIds.errorMessage),
        matching: find.text(Copy.uploadErrorPrepare),
      ),
      findsOneWidget,
    );
  });

  widgetTest('TC-UPL-047 사진이 없으면 전시하기는 비활성이고 사진을 고르면 활성이다', (tester) async {
    final s = await _open(tester);
    expect(isEnabled(tester, UploadTestIds.submitButton), isFalse);
    await _pickAndFinishEdit(tester, s);
    expect(byId(UploadTestIds.photoPreview), findsOneWidget);
    expect(isEnabled(tester, UploadTestIds.submitButton), isTrue);
  });

  widgetTest('TC-UPL-047 준비 중에도 활성이고 준비 중 표시가 있다', (tester) async {
    final s = await _open(
      tester,
      script: (rig) => rig.api.policy([
        'posts-uploads__issued.json',
      ], delay: const Duration(seconds: 30)),
    );
    await _pickAndFinishEdit(tester, s);
    expect(byId(UploadTestIds.preparingIndicator), findsOneWidget);
    expect(isEnabled(tester, UploadTestIds.submitButton), isTrue);
  });

  widgetTest('TC-UPL-047 제출 중에는 전시 중... 문구와 진행 표시가 보이고 버튼은 비활성이다', (
    tester,
  ) async {
    final s = await _open(
      tester,
      script: (rig) =>
          rig.api.put(['s3-put__200.json'], delay: const Duration(seconds: 30)),
    );
    await _pickAndFinishEdit(tester, s);
    await tester.tap(byId(UploadTestIds.submitButton));
    await settleUi(tester, frames: 10);
    expect(
      find.descendant(
        of: byId(UploadTestIds.submitButton),
        matching: find.text(Copy.uploadSubmitting),
      ),
      findsOneWidget,
    );
    expect(byId(UploadTestIds.submittingIndicator), findsOneWidget);
    expect(isEnabled(tester, UploadTestIds.submitButton), isFalse);
  });

  widgetTest('TC-UPL-080 한글 11자를 입력하면 10자까지만 보인다', (tester) async {
    await _open(tester);
    await tester.enterText(
      find.descendant(
        of: byId(UploadTestIds.titleInput),
        matching: find.byType(EditableText),
      ),
      '가나다라마바사아자차카',
    );
    await settleUi(tester);
    expect(find.text('가나다라마바사아자차'), findsOneWidget);
    expect(find.text('가나다라마바사아자차카'), findsNothing);
  });

  widgetTest('TC-UPL-080 이모지 10개는 허용하고 11번째는 들어가지 않는다', (tester) async {
    await _open(tester);
    final field = find.descendant(
      of: byId(UploadTestIds.titleInput),
      matching: find.byType(EditableText),
    );
    final ten = List.filled(10, '😀').join();
    await tester.enterText(field, ten);
    await settleUi(tester);
    expect(find.text(ten), findsOneWidget);
    await tester.enterText(field, '$ten😀');
    await settleUi(tester);
    expect(find.text(ten), findsOneWidget);
  });

  widgetTest('TC-UPL-081 결합 이모지 2개(10 code point) 뒤 한 글자는 막힌다', (tester) async {
    await _open(tester);
    final field = find.descendant(
      of: byId(UploadTestIds.titleInput),
      matching: find.byType(EditableText),
    );
    const family = '👨‍👩‍👧';
    const two = '$family$family';
    await tester.enterText(field, two);
    await settleUi(tester);
    expect(find.text(two), findsOneWidget);
    await tester.enterText(field, '$two가');
    await settleUi(tester);
    expect(find.text(two), findsOneWidget);
  });

  widgetTest('TC-EDIT-006 선택한 사진을 탭하면 편집기가 다시 열린다', (tester) async {
    final s = await _open(tester);
    await _pickAndFinishEdit(tester, s);
    await tester.tap(byId(UploadTestIds.photoPreview));
    await settleUi(tester, frames: 20);
    expect(byId(PhotoEditTestIds.root), findsOneWidget);
  });
}
