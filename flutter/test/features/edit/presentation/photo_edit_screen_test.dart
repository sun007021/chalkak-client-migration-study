import 'dart:async';
import 'dart:ui' show Tristate;

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/edit/domain/adjustment.dart';
import 'package:chalkak/features/edit/domain/crop_aspect_ratio.dart';
import 'package:chalkak/features/edit/domain/photo_filter.dart';
import 'package:chalkak/features/edit/presentation/photo_edit_screen.dart';
import 'package:chalkak/features/edit/presentation/photo_edit_test_ids.dart';
import 'package:chalkak/features/edit/presentation/photo_edit_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart'
    show byId, pumpScreen, settleUi, widgetTest;
import '../../../support/ui_helpers.dart' show isChecked;
import '../../../support/upload_fakes.dart';

class _Screen {
  _Screen(this.vm, this.loader, this.renderer, this.analyzer, this.events);

  final PhotoEditViewModel vm;
  final FakeEditSourceLoader loader;
  final FakePhotoEditRenderer renderer;
  final FakeAutoAnalyzer analyzer;
  final List<PhotoEditEvent> events;
}

Future<_Screen> _open(WidgetTester tester) async {
  final loader = FakeEditSourceLoader();
  final renderer = FakePhotoEditRenderer();
  final analyzer = FakeAutoAnalyzer();
  final vm = PhotoEditViewModel(
    sourceBytes: photoBytes(),
    loader: loader,
    renderer: renderer,
    analyzer: analyzer,
  );
  addTearDown(vm.dispose);
  final events = <PhotoEditEvent>[];
  final sub = vm.events.listen(events.add);
  addTearDown(sub.cancel);
  await pumpScreen(tester, PhotoEditScreen(viewModel: vm));
  await settleUi(tester, frames: 20);
  return _Screen(vm, loader, renderer, analyzer, events);
}

bool? _selected(WidgetTester tester, String id) {
  final flag = tester
      .getSemantics(byId(id))
      .getSemanticsData()
      .flagsCollection
      .isSelected;
  return switch (flag) {
    Tristate.isTrue => true,
    Tristate.isFalse => false,
    _ => null,
  };
}

Finder _label(String text) => find.text(text, skipOffstage: false);

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await settleUi(tester, frames: 12);
}

void main() {
  group('공통 구성', () {
    widgetTest(
      'TC-EDIT-002 REQ-EDIT-001 상단 취소/완료, 도구 탭, 90도 회전, 초기화와 testID가 보인다',
      (tester) async {
        await _open(tester);
        for (final id in [
          PhotoEditTestIds.root,
          PhotoEditTestIds.cancelButton,
          PhotoEditTestIds.doneButton,
          PhotoEditTestIds.tabCrop,
          PhotoEditTestIds.tabAdjust,
          PhotoEditTestIds.tabFilter,
          PhotoEditTestIds.previewImage,
          PhotoEditTestIds.cropArea,
          PhotoEditTestIds.rotateButton,
          PhotoEditTestIds.resetButton,
        ]) {
          expect(byId(id), findsOneWidget, reason: id);
        }
        for (final text in [
          Copy.editTopCancel,
          Copy.editTopDone,
          Copy.editTabCrop,
          Copy.editTabAdjust,
          Copy.editTabFilter,
          Copy.editCropRotate,
          Copy.editCropReset,
        ]) {
          expect(_label(text), findsWidgets, reason: text);
        }
      },
    );

    widgetTest(
      'TC-EDIT-001 REQ-EDIT-001 화면이 start를 불러 원본을 한 번 준비하고 처음에는 자르기 탭이 선택돼 있다',
      (tester) async {
        final s = await _open(tester);
        expect(s.loader.loads, 1);
        expect(s.renderer.renders, 0);
        expect(_selected(tester, PhotoEditTestIds.tabCrop), isTrue);
        expect(_selected(tester, PhotoEditTestIds.tabAdjust), isFalse);
        expect(_selected(tester, PhotoEditTestIds.tabFilter), isFalse);
      },
    );

    widgetTest('REQ-EDIT-001 탭을 누르면 선택 탭이 바뀐다', (tester) async {
      final s = await _open(tester);
      await _tap(tester, byId(PhotoEditTestIds.tabFilter));
      expect(s.vm.state.tab, EditTab.filter);
      expect(_selected(tester, PhotoEditTestIds.tabFilter), isTrue);
      expect(_selected(tester, PhotoEditTestIds.tabCrop), isFalse);
      await _tap(tester, byId(PhotoEditTestIds.tabAdjust));
      expect(_selected(tester, PhotoEditTestIds.tabAdjust), isTrue);
    });

    widgetTest('REQ-EDIT-003 "취소"를 누르면 렌더 없이 취소 이벤트가 나간다', (tester) async {
      final s = await _open(tester);
      await _tap(tester, byId(PhotoEditTestIds.cancelButton));
      expect(s.events.single, isA<EditCancelled>());
      expect(s.renderer.renders, 0);
    });

    widgetTest('TC-EDIT-003 "완료"를 누르면 렌더 1회 뒤 완료 이벤트가 나간다', (tester) async {
      final s = await _open(tester);
      await _tap(tester, byId(PhotoEditTestIds.doneButton));
      expect(s.renderer.renders, 1);
      expect(s.events.single, isA<EditDone>());
    });
  });

  group('자르기 탭', () {
    widgetTest('TC-EDIT-013 REQ-EDIT-010 비율 9종 버튼이 모두 있고 처음에는 자유가 선택돼 있다', (
      tester,
    ) async {
      await _open(tester);
      const ids = [
        PhotoEditTestIds.ratioOriginal,
        PhotoEditTestIds.ratioFree,
        PhotoEditTestIds.ratio1x1,
        PhotoEditTestIds.ratio4x5,
        PhotoEditTestIds.ratio5x4,
        PhotoEditTestIds.ratio3x4,
        PhotoEditTestIds.ratio4x3,
        PhotoEditTestIds.ratio9x16,
        PhotoEditTestIds.ratio16x9,
      ];
      for (final id in ids) {
        expect(byId(id).evaluate(), isNotEmpty, reason: id);
      }
      for (final r in CropAspectRatio.values) {
        expect(_label(r.label), findsWidgets, reason: r.name);
      }
      await tester.ensureVisible(byId(PhotoEditTestIds.ratioFree));
      expect(_selected(tester, PhotoEditTestIds.ratioFree), isTrue);
      expect(_selected(tester, PhotoEditTestIds.ratioOriginal), isFalse);
    });

    widgetTest('REQ-EDIT-011 비율 버튼을 누르면 그 비율이 선택된다', (tester) async {
      final s = await _open(tester);
      await _tap(tester, byId(PhotoEditTestIds.ratio1x1));
      expect(s.vm.state.ratio, CropAspectRatio.r1x1);
      expect(_selected(tester, PhotoEditTestIds.ratio1x1), isTrue);
      expect(_selected(tester, PhotoEditTestIds.ratioFree), isFalse);
    });

    widgetTest('REQ-EDIT-014 "90도 회전"을 누르면 시계 방향으로 한 번 돈다', (tester) async {
      final s = await _open(tester);
      await _tap(tester, byId(PhotoEditTestIds.rotateButton));
      expect(s.vm.state.quarterTurns, 1);
    });

    widgetTest('REQ-EDIT-016 자르기 탭 "초기화"는 회전과 비율을 처음으로 되돌린다', (tester) async {
      final s = await _open(tester);
      await _tap(tester, byId(PhotoEditTestIds.rotateButton));
      await _tap(tester, byId(PhotoEditTestIds.ratio1x1));
      await _tap(tester, byId(PhotoEditTestIds.resetButton));
      expect(s.vm.state.quarterTurns, 0);
      expect(s.vm.state.ratio, CropAspectRatio.free);
    });
  });

  group('조정 탭', () {
    widgetTest(
      'TC-EDIT-023 REQ-EDIT-019 항목 줄에 자동, 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함이 있다',
      (tester) async {
        await _open(tester);
        await _tap(tester, byId(PhotoEditTestIds.tabAdjust));
        for (final item in AdjustItem.values) {
          expect(_label(item.label), findsWidgets, reason: item.name);
        }
        expect(_label(Copy.editAdjustReset), findsWidgets);
      },
    );

    widgetTest('TC-EDIT-023 항목을 고르면 그 항목의 눈금자가 보이고 표시값은 값 x 100 정수다', (
      tester,
    ) async {
      final s = await _open(tester);
      await _tap(tester, byId(PhotoEditTestIds.tabAdjust));
      await _tap(tester, _label(Copy.editAdjustExposure));
      expect(s.vm.state.adjustItem, AdjustItem.exposure);
      expect(byId(PhotoEditTestIds.adjustExposureSlider), findsOneWidget);

      s.vm.setAdjustValue(AdjustItem.exposure, 0.5);
      await settleUi(tester);
      expect(
        find.descendant(
          of: byId(PhotoEditTestIds.adjustExposureSlider),
          matching: find.text('50'),
        ),
        findsWidgets,
      );
      s.vm.setAdjustValue(AdjustItem.exposure, -1);
      await settleUi(tester);
      expect(
        find.descendant(
          of: byId(PhotoEditTestIds.adjustExposureSlider),
          matching: find.text('-100'),
        ),
        findsWidgets,
      );
    });

    widgetTest('REQ-EDIT-020 REQ-EDIT-021 처음 선택은 자동이고 꺼져 있으며 토글을 누르면 켜진다', (
      tester,
    ) async {
      final s = await _open(tester);
      await _tap(tester, byId(PhotoEditTestIds.tabAdjust));
      expect(s.vm.state.adjustItem, AdjustItem.auto);
      expect(isChecked(tester, PhotoEditTestIds.adjustAutoToggle), isFalse);
      expect(byId(PhotoEditTestIds.adjustAutoStrengthSlider), findsOneWidget);

      await _tap(tester, byId(PhotoEditTestIds.adjustAutoToggle));
      expect(s.vm.state.layers.autoStrength, 1);
      expect(isChecked(tester, PhotoEditTestIds.adjustAutoToggle), isTrue);

      await _tap(tester, byId(PhotoEditTestIds.adjustAutoToggle));
      expect(s.vm.state.layers.autoStrength, 0);
      expect(isChecked(tester, PhotoEditTestIds.adjustAutoToggle), isFalse);
    });

    widgetTest('REQ-EDIT-024 조정 탭 "초기화"는 자동 강도와 직접 만진 값을 지운다', (tester) async {
      final s = await _open(tester);
      await _tap(tester, byId(PhotoEditTestIds.tabAdjust));
      s.vm.setAutoStrength(1);
      s.vm.setAdjustValue(AdjustItem.warmth, 0.3);
      await settleUi(tester);
      await _tap(tester, byId(PhotoEditTestIds.resetButton));
      expect(s.vm.state.layers.autoStrength, 0);
      expect(s.vm.state.layers.userValues, isEmpty);
    });
  });

  group('필터 탭', () {
    widgetTest('TC-EDIT-039 REQ-EDIT-028 필터 6종 버튼이 있고 처음에는 원본이 선택돼 있다', (
      tester,
    ) async {
      await _open(tester);
      await _tap(tester, byId(PhotoEditTestIds.tabFilter));
      const ids = [
        PhotoEditTestIds.filterOriginal,
        PhotoEditTestIds.filterMono,
        PhotoEditTestIds.filterWarm,
        PhotoEditTestIds.filterCool,
        PhotoEditTestIds.filterVintage,
        PhotoEditTestIds.filterVivid,
      ];
      for (final id in ids) {
        expect(byId(id).evaluate(), isNotEmpty, reason: id);
      }
      for (final f in PhotoFilter.values) {
        expect(_label(f.label), findsWidgets, reason: f.name);
      }
      expect(_selected(tester, PhotoEditTestIds.filterOriginal), isTrue);
      expect(_selected(tester, PhotoEditTestIds.filterMono), isFalse);
    });

    widgetTest('TC-EDIT-039 필터를 누르면 그 필터가 선택된다', (tester) async {
      final s = await _open(tester);
      await _tap(tester, byId(PhotoEditTestIds.tabFilter));
      await _tap(tester, byId(PhotoEditTestIds.filterVintage));
      expect(s.vm.state.filter, PhotoFilter.vintage);
      expect(_selected(tester, PhotoEditTestIds.filterVintage), isTrue);
      expect(_selected(tester, PhotoEditTestIds.filterOriginal), isFalse);
    });
  });

  group('렌더링 상태와 오류', () {
    widgetTest('TC-EDIT-003 렌더링 중에만 진행 표시가 있고 끝나면 사라진다', (tester) async {
      final s = await _open(tester);
      expect(byId(PhotoEditTestIds.renderingIndicator), findsNothing);
      s.renderer.gate = Completer<void>();
      await tester.tap(byId(PhotoEditTestIds.doneButton));
      await settleUi(tester);
      expect(byId(PhotoEditTestIds.renderingIndicator), findsOneWidget);
      expect(s.events, isEmpty);

      s.renderer.gate!.complete();
      await settleUi(tester, frames: 20);
      expect(byId(PhotoEditTestIds.renderingIndicator), findsNothing);
      expect(s.events.single, isA<EditDone>());
    });

    widgetTest(
      'TC-EDIT-008 REQ-EDIT-006 렌더링에 실패하면 화면을 닫지 않고 오류 알림을 보여 주며 다시 시도할 수 있다',
      (tester) async {
        final s = await _open(tester);
        expect(byId(PhotoEditTestIds.errorDialog), findsNothing);
        s.renderer.error = StateError('렌더 실패');
        await tester.tap(byId(PhotoEditTestIds.doneButton));
        await settleUi(tester, frames: 20);

        expect(byId(PhotoEditTestIds.root), findsOneWidget);
        expect(byId(PhotoEditTestIds.errorDialog), findsOneWidget);
        expect(
          find.descendant(
            of: byId(PhotoEditTestIds.errorDialog),
            matching: find.text(Copy.editErrorRender),
          ),
          findsOneWidget,
        );
        expect(s.events, isEmpty);

        s.vm.dismissError();
        await settleUi(tester, frames: 20);
        expect(byId(PhotoEditTestIds.errorDialog), findsNothing);

        s.renderer.error = null;
        await _tap(tester, byId(PhotoEditTestIds.doneButton));
        expect(s.events.single, isA<EditDone>());
      },
    );
  });
}
