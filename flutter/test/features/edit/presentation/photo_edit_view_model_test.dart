import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/edit/domain/adjustment.dart';
import 'package:chalkak/features/edit/domain/crop_aspect_ratio.dart';
import 'package:chalkak/features/edit/domain/crop_window.dart';
import 'package:chalkak/features/edit/domain/photo_edit.dart';
import 'package:chalkak/features/edit/domain/photo_filter.dart';
import 'package:chalkak/features/edit/presentation/photo_edit_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/upload_fakes.dart';

/// 편집기 ViewModel과 Fake 의존성. 기본 사진은 4000x3000이다.
class _Rig {
  _Rig({PhotoEdit initial = PhotoEdit.identity}) {
    vm = PhotoEditViewModel(
      sourceBytes: photoBytes(),
      loader: loader,
      renderer: renderer,
      analyzer: analyzer,
      initial: initial,
    );
    sub = vm.events.listen(events.add);
  }

  final FakeEditSourceLoader loader = FakeEditSourceLoader();
  final FakePhotoEditRenderer renderer = FakePhotoEditRenderer();
  final FakeAutoAnalyzer analyzer = FakeAutoAnalyzer();
  final List<PhotoEditEvent> events = [];
  late final PhotoEditViewModel vm;
  late final StreamSubscription<PhotoEditEvent> sub;

  PhotoEditState get state => vm.state;

  Future<void> started() async {
    await vm.start();
  }

  Iterable<EditDone> get dones => events.whereType<EditDone>();
  Iterable<EditCancelled> get cancels => events.whereType<EditCancelled>();

  Future<void> dispose() async {
    await sub.cancel();
    vm.dispose();
  }
}

void _test(
  String name,
  Future<void> Function(_Rig r) body, {
  PhotoEdit initial = PhotoEdit.identity,
}) {
  test(name, () async {
    final r = _Rig(initial: initial);
    try {
      await body(r);
    } finally {
      await r.dispose();
    }
  });
}

const _half = CropWindow(centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5);

void main() {
  group('시작', () {
    _test('TC-EDIT-001 start를 여러 번 불러도 원본 준비와 자동 보정 분석은 한 번이고 렌더링은 하지 않는다', (
      r,
    ) async {
      await Future.wait([r.vm.start(), r.vm.start()]);
      await r.vm.start();
      expect(r.loader.loads, 1);
      expect(r.analyzer.calls, 1);
      expect(r.renderer.renders, 0);
      expect(r.state.isReady, isTrue);
      expect(r.state.preview, isNotNull);
    });

    _test(
      'REQ-EDIT-001 REQ-EDIT-010 REQ-EDIT-020 REQ-EDIT-028 시작 상태: 자르기 탭, 비율 자유, 회전 0, 전체 자르기, 조정 항목 자동·강도 0, 필터 원본',
      (r) async {
        await r.started();
        final s = r.state;
        expect(s.tab, EditTab.crop);
        expect(s.ratio, CropAspectRatio.free);
        expect(s.quarterTurns, 0);
        expect(s.crop, CropWindow.full);
        expect(s.adjustItem, AdjustItem.auto);
        expect(s.layers.autoStrength, 0);
        expect(s.filter, PhotoFilter.original);
        expect(s.isRendering, isFalse);
        expect(s.error, isNull);
        expect(r.vm.currentEdit.isIdentity, isTrue);
      },
    );

    _test('REQ-EDIT-025 처음 열 때 분석한 자동값은 보관만 하고 강도는 0이라 적용되지 않는다', (r) async {
      await r.started();
      expect(r.state.layers.autoValues, r.analyzer.result);
      expect(r.state.layers.effectiveValues, AdjustmentValues.zero);
    });

    _test('REQ-EDIT-027 사진을 분석할 수 없으면 자동 보정은 아무것도 바꾸지 않는다', (r) async {
      r.analyzer.result = AdjustmentValues.zero;
      await r.started();
      r.vm.setAutoStrength(1);
      expect(r.state.layers.effectiveValues, AdjustmentValues.zero);
      expect(r.vm.currentEdit.isIdentity, isTrue);
    });

    _test('TC-EDIT-037 재편집으로 열 때 저장된 자동값이 있으면 그 값을 쓰고 재분석하지 않는다', (r) async {
      await r.started();
      expect(r.analyzer.calls, 0);
      expect(r.state.layers.autoValues, const AdjustmentValues(exposure: 0.7));
      expect(r.state.layers.effective(AdjustItem.exposure), 0.7);
      expect(r.vm.currentEdit, _reedit);
    }, initial: _reedit);
  });

  group('완료', () {
    _test('TC-EDIT-003 완료는 렌더를 한 번만 하고 같은 편집값을 EditDone으로 전달한다', (r) async {
      await r.started();
      r.vm.selectFilter(PhotoFilter.mono);
      r.vm.setAdjustValue(AdjustItem.exposure, 0.3);
      r.vm.updateCrop(_half);
      await r.vm.onDonePressed();

      expect(r.renderer.renders, 1);
      expect(r.dones, hasLength(1));
      final done = r.dones.single;
      expect(done.edit.filter, PhotoFilter.mono);
      expect(done.edit.adjustments.effective(AdjustItem.exposure), 0.3);
      expect(done.edit.crop, _half);
      expect(r.renderer.edits.single, done.edit);
      expect(r.state.isRendering, isFalse);
    });

    _test('TC-EDIT-003 렌더링 중 다시 눌러도 렌더는 한 번이다', (r) async {
      await r.started();
      r.renderer.gate = Completer<void>();
      final first = r.vm.onDonePressed();
      await Future<void>.delayed(Duration.zero);
      expect(r.state.isRendering, isTrue);
      final second = r.vm.onDonePressed();
      r.renderer.gate!.complete();
      await Future.wait([first, second]);
      expect(r.renderer.renders, 1);
      expect(r.dones, hasLength(1));
    });

    _test('TC-EDIT-011 편집하지 않고 완료하면 isIdentity인 편집값이 나간다', (r) async {
      await r.started();
      await r.vm.onDonePressed();
      expect(r.dones.single.edit.isIdentity, isTrue);
      expect(r.dones.single.edit, PhotoEdit.identity);
    });

    _test('REQ-EDIT-004 자르기가 전체와 1e-3 이내로 같으면 전체로 확정한다', (r) async {
      await r.started();
      r.vm.updateCrop(
        const CropWindow(
          centerX: 0.5003,
          centerY: 0.5,
          width: 0.9996,
          height: 1,
        ),
      );
      await r.vm.onDonePressed();
      expect(r.dones.single.edit.crop, CropWindow.full);
      expect(r.dones.single.edit.isIdentity, isTrue);
    });

    _test('REQ-EDIT-004 자동 보정이 꺼져 있으면 자동 보정값은 버리고 확정한다', (r) async {
      await r.started();
      r.vm.setAdjustValue(AdjustItem.warmth, 0.2);
      await r.vm.onDonePressed();
      final layers = r.dones.single.edit.adjustments;
      expect(layers.autoStrength, 0);
      expect(layers.autoValues, AdjustmentValues.zero);
      expect(layers.userValues, {AdjustItem.warmth: 0.2});
    });

    _test('REQ-EDIT-004 자동 보정을 켠 채 완료하면 자동값과 강도를 저장한다', (r) async {
      await r.started();
      r.vm.setAutoStrength(1);
      await r.vm.onDonePressed();
      final layers = r.dones.single.edit.adjustments;
      expect(layers.autoStrength, 1);
      expect(layers.autoValues, r.analyzer.result);
    });

    _test('TC-EDIT-008 REQ-EDIT-006 렌더링에 실패하면 닫지 않고 오류 문구를 보여 주며 다시 시도할 수 있다', (
      r,
    ) async {
      await r.started();
      r.renderer.error = StateError('렌더 실패');
      await r.vm.onDonePressed();
      expect(r.dones, isEmpty);
      expect(r.cancels, isEmpty);
      expect(r.state.error, Copy.editErrorRender);
      expect(r.state.isRendering, isFalse);

      r.vm.dismissError();
      expect(r.state.error, isNull);

      r.renderer.error = null;
      await r.vm.onDonePressed();
      expect(r.dones, hasLength(1));
      expect(r.state.error, isNull);
    });
  });

  group('취소', () {
    _test('TC-EDIT-004 REQ-EDIT-003 취소는 렌더 없이 취소 이벤트만 낸다', (r) async {
      await r.started();
      r.vm.selectFilter(PhotoFilter.vivid);
      r.vm.rotate();
      r.vm.onCancelPressed();
      expect(r.renderer.renders, 0);
      expect(r.cancels, hasLength(1));
      expect(r.dones, isEmpty);
    });

    _test('TC-EDIT-045 필터를 바꾼 뒤 취소해도 완료 이벤트가 없어 호출한 쪽의 이전 필터가 유지된다', (r) async {
      await r.started();
      r.vm.selectTab(EditTab.filter);
      r.vm.selectFilter(PhotoFilter.vintage);
      expect(r.state.filter, PhotoFilter.vintage);
      r.vm.onCancelPressed();
      expect(r.events.single, isA<EditCancelled>());
      expect(r.vm.initial.filter, PhotoFilter.mono);
    }, initial: const PhotoEdit(filter: PhotoFilter.mono));
  });

  group('자르기·회전', () {
    _test(
      'TC-EDIT-014 REQ-EDIT-011 비율을 새로 고르면 이전 자르기 영역을 버리고 전체에서 가장 크게 다시 시작한다',
      (r) async {
        await r.started();
        r.vm.updateCrop(_half);
        r.vm.selectRatio(CropAspectRatio.r1x1);
        expect(r.state.ratio, CropAspectRatio.r1x1);
        expect(r.state.crop.width, closeTo(0.75, 1e-9));
        expect(r.state.crop.height, closeTo(1, 1e-9));
        expect(r.state.crop.centerX, closeTo(0.5, 1e-9));
        expect(r.state.crop.centerY, closeTo(0.5, 1e-9));
      },
    );

    _test('REQ-EDIT-011 자유를 고르면 현재 영역을 유지하고 비율 고정만 푼다', (r) async {
      await r.started();
      r.vm.selectRatio(CropAspectRatio.r1x1);
      final before = r.state.crop;
      r.vm.selectRatio(CropAspectRatio.free);
      expect(r.state.ratio, CropAspectRatio.free);
      expect(r.state.crop, before);
    });

    _test('REQ-EDIT-012 원본 비율은 지금 회전 방향의 사진 비율로 가장 크게 들어가 전체가 된다', (r) async {
      await r.started();
      r.vm.updateCrop(_half);
      r.vm.selectRatio(CropAspectRatio.original);
      expect(r.state.crop.width, closeTo(1, 1e-9));
      expect(r.state.crop.height, closeTo(1, 1e-9));
      r.vm.rotate();
      r.vm.selectRatio(CropAspectRatio.original);
      expect(r.state.crop.width, closeTo(1, 1e-9));
      expect(r.state.crop.height, closeTo(1, 1e-9));
    });

    _test('TC-EDIT-015 REQ-EDIT-014 90도 회전은 시계 방향으로 1, 2, 3, 0이 된다', (r) async {
      await r.started();
      final turns = <int>[];
      for (var i = 0; i < 4; i++) {
        r.vm.rotate();
        turns.add(r.state.quarterTurns);
      }
      expect(turns, [1, 2, 3, 0]);
      expect(r.vm.currentEdit.quarterTurns, 0);
    });

    _test('TC-EDIT-015 REQ-EDIT-014 고정 비율은 회전한 뒤에도 같은 비율로 다시 가장 크게 맞춘다', (
      r,
    ) async {
      await r.started();
      r.vm.selectRatio(CropAspectRatio.r4x5);
      r.vm.rotate();
      expect(r.state.ratio, CropAspectRatio.r4x5);
      // 돌린 사진은 3000x4000. 4:5가 가장 크게 들어가면 가로를 다 쓴다.
      expect(r.state.crop.width, closeTo(1, 1e-9));
      expect(
        (r.state.crop.width * 3000) / (r.state.crop.height * 4000),
        closeTo(4 / 5, 1e-6),
      );
    });

    _test('TC-EDIT-015 REQ-EDIT-015 영역이 전체인 자유 자르기는 사진과 함께 돌아 전체로 남는다', (
      r,
    ) async {
      await r.started();
      r.vm.rotate();
      expect(r.state.ratio, CropAspectRatio.free);
      expect(r.state.crop, CropWindow.full);
      expect(r.vm.currentEdit.crop, CropWindow.full);
      expect(r.vm.currentEdit.quarterTurns, 1);
    });

    _test('TC-EDIT-015 준비되기 전에는 회전해도 현재 화면을 유지한다', (r) async {
      r.loader.gate = Completer<void>();
      final started = r.vm.start();
      await Future<void>.delayed(Duration.zero);
      expect(r.state.isReady, isFalse);
      r.vm.rotate();
      expect(r.state.quarterTurns, 0);
      r.loader.gate!.complete();
      await started;
      r.vm.rotate();
      expect(r.state.quarterTurns, 1);
    });

    _test('REQ-EDIT-014 회전 뒤 저장 모델의 자르기 중심은 회전 전 원본 비율이다', (r) async {
      await r.started();
      r.vm.rotate();
      // 돌린 사진의 왼쪽 절반(TC-EDIT-016): 원본 기준 중심 (0.5, 0.75), 크기 (0.5, 1).
      r.vm.updateCrop(
        const CropWindow(centerX: 0.25, centerY: 0.5, width: 0.5, height: 1),
      );
      final crop = r.vm.currentEdit.crop;
      expect(crop.centerX, closeTo(0.5, 1e-9));
      expect(crop.centerY, closeTo(0.75, 1e-9));
      expect(crop.width, closeTo(0.5, 1e-9));
      expect(crop.height, closeTo(1, 1e-9));
    });

    _test('REQ-EDIT-016 자르기 초기화는 회전과 자르기 영역·비율만 처음으로 되돌리고 필터와 조정은 유지한다', (
      r,
    ) async {
      await r.started();
      r.vm.rotate();
      r.vm.selectRatio(CropAspectRatio.r3x4);
      r.vm.selectFilter(PhotoFilter.cool);
      r.vm.setAdjustValue(AdjustItem.contrast, 0.4);
      r.vm.resetCrop();
      expect(r.state.quarterTurns, 0);
      expect(r.state.crop, CropWindow.full);
      expect(r.state.ratio, CropAspectRatio.free);
      expect(r.state.filter, PhotoFilter.cool);
      expect(r.state.layers.effective(AdjustItem.contrast), 0.4);
    });

    _test(
      'TC-EDIT-012 회전·자르기·조정·필터가 바뀐 뒤 탭마다 초기화하면 모두 기본값이 되어 isIdentity가 된다',
      (r) async {
        await r.started();
        r.vm.rotate();
        r.vm.updateCrop(_half);
        r.vm.selectFilter(PhotoFilter.warm);
        r.vm.setAdjustValue(AdjustItem.exposure, 0.5);
        expect(r.vm.currentEdit.isIdentity, isFalse);
        r.vm.resetCrop();
        r.vm.resetAdjustments();
        r.vm.selectFilter(PhotoFilter.original);
        expect(r.vm.currentEdit.isIdentity, isTrue);
      },
    );
  });

  group('조정과 자동 보정', () {
    _test('TC-EDIT-023 REQ-EDIT-019 조정 값은 -1~1 범위로 받는다', (r) async {
      await r.started();
      r.vm.setAdjustValue(AdjustItem.saturation, 1);
      expect(r.state.layers.effective(AdjustItem.saturation), 1);
      r.vm.setAdjustValue(AdjustItem.saturation, -1);
      expect(r.state.layers.effective(AdjustItem.saturation), -1);
    });

    _test('REQ-EDIT-021 자동이 이미 선택돼 있고 꺼져 있으면 누르면 강도 1로 켜지고 다시 누르면 꺼진다', (
      r,
    ) async {
      await r.started();
      expect(r.state.adjustItem, AdjustItem.auto);
      expect(r.state.layers.autoStrength, 0);
      r.vm.selectAdjustItem(AdjustItem.auto);
      expect(r.state.layers.autoStrength, 1);
      r.vm.selectAdjustItem(AdjustItem.auto);
      expect(r.state.layers.autoStrength, 0);
      r.vm.selectAdjustItem(AdjustItem.auto);
      expect(r.state.layers.autoStrength, 1);
    });

    _test('REQ-EDIT-021 다른 항목에서 자동으로 옮겨 오면 꺼져 있을 때만 켜고 켜져 있으면 그대로 둔다', (
      r,
    ) async {
      await r.started();
      r.vm.selectAdjustItem(AdjustItem.exposure);
      expect(r.state.adjustItem, AdjustItem.exposure);
      expect(r.state.layers.autoStrength, 0);
      r.vm.selectAdjustItem(AdjustItem.auto);
      expect(r.state.layers.autoStrength, 1);

      r.vm.setAutoStrength(0.5);
      r.vm.selectAdjustItem(AdjustItem.contrast);
      r.vm.selectAdjustItem(AdjustItem.auto);
      expect(r.state.layers.autoStrength, 0.5);
    });

    _test('TC-EDIT-032 자동 보정을 켜면 항목마다 분석값 x 강도로 채워지고 편집값에 들어간다', (r) async {
      await r.started();
      r.vm.setAutoStrength(1);
      expect(r.state.layers.effective(AdjustItem.exposure), closeTo(0.4, 1e-9));
      expect(r.state.layers.effective(AdjustItem.contrast), closeTo(0.2, 1e-9));
      r.vm.setAutoStrength(0.5);
      expect(r.state.layers.effective(AdjustItem.exposure), closeTo(0.2, 1e-9));
      expect(
        r.vm.currentEdit.adjustments.effective(AdjustItem.contrast),
        closeTo(0.1, 1e-9),
      );
    });

    _test('TC-EDIT-030 사용자 노출 0.3과 자동 보정(강도 1)이면 노출 0.3, 대비 0.2다', (r) async {
      await r.started();
      r.vm.setAutoStrength(1);
      r.vm.setAdjustValue(AdjustItem.exposure, 0.3);
      expect(r.state.layers.effective(AdjustItem.exposure), 0.3);
      expect(r.state.layers.effective(AdjustItem.contrast), closeTo(0.2, 1e-9));
    });

    _test('TC-EDIT-031 항목을 자동 보정 몫으로 되돌리면 다시 자동 보정을 따른다', (r) async {
      await r.started();
      r.vm.setAutoStrength(1);
      r.vm.setAdjustValue(AdjustItem.exposure, 0.1);
      expect(r.state.layers.isUserTouched(AdjustItem.exposure), isTrue);
      r.vm.setAdjustValue(AdjustItem.exposure, 0.4);
      expect(r.state.layers.isUserTouched(AdjustItem.exposure), isFalse);
      r.vm.setAutoStrength(0.5);
      expect(r.state.layers.effective(AdjustItem.exposure), closeTo(0.2, 1e-9));
    });

    _test('TC-EDIT-031 자동 보정을 켜기 전에 만진 항목은 켜도 사용자 값이 유지된다', (r) async {
      await r.started();
      r.vm.setAdjustValue(AdjustItem.exposure, 0.3);
      r.vm.selectAdjustItem(AdjustItem.auto);
      expect(r.state.layers.autoStrength, 1);
      expect(r.state.layers.effective(AdjustItem.exposure), 0.3);
    });

    _test('REQ-EDIT-024 조정 초기화는 강도 0, 직접 만진 값 삭제이고 분석한 자동값은 재분석 없이 유지한다', (
      r,
    ) async {
      await r.started();
      r.vm.setAutoStrength(1);
      r.vm.setAdjustValue(AdjustItem.exposure, 0.3);
      r.vm.resetAdjustments();
      expect(r.state.layers.autoStrength, 0);
      expect(r.state.layers.userValues, isEmpty);
      expect(r.state.layers.autoValues, r.analyzer.result);
      expect(r.analyzer.calls, 1);
      r.vm.setAutoStrength(1);
      expect(r.state.layers.effective(AdjustItem.exposure), closeTo(0.4, 1e-9));
    });

    _test('TC-EDIT-037 자르기를 바꾼 뒤 탭을 옮기면 자른 영역 기준으로 자동 보정값을 다시 구한다', (r) async {
      await r.started();
      expect(r.analyzer.calls, 1);
      r.vm.updateCrop(_half);
      r.vm.selectTab(EditTab.adjust);
      await Future<void>.delayed(Duration.zero);
      expect(r.analyzer.calls, 2);
      // 미리보기(4x3)의 가로세로 절반을 자른 영역(2x1 또는 2x2)이어야 한다.
      expect(r.analyzer.analyzed.last.width, 2);
      expect(r.analyzer.analyzed.last.height, lessThan(3));
    });

    _test('REQ-EDIT-025 같은 자르기로 이미 분석했으면 탭을 옮겨도 다시 분석하지 않는다', (r) async {
      await r.started();
      r.vm.selectTab(EditTab.adjust);
      r.vm.selectTab(EditTab.filter);
      r.vm.selectTab(EditTab.crop);
      await Future<void>.delayed(Duration.zero);
      expect(r.analyzer.calls, 1);

      r.vm.updateCrop(_half);
      r.vm.selectTab(EditTab.adjust);
      r.vm.selectTab(EditTab.crop);
      r.vm.selectTab(EditTab.filter);
      await Future<void>.delayed(Duration.zero);
      expect(r.analyzer.calls, 2);
    });

    _test('REQ-EDIT-025 자동 보정을 켠 채 자르기를 바꾸고 완료하면 자른 영역으로 다시 분석한다', (r) async {
      await r.started();
      r.vm.setAutoStrength(1);
      r.vm.updateCrop(_half);
      await r.vm.onDonePressed();
      expect(r.analyzer.calls, 2);
      expect(r.dones, hasLength(1));
    });

    _test('TC-EDIT-022 자르기를 바꾼 뒤 다른 탭으로 옮겨도 선택한 필터와 조정은 유지된다', (r) async {
      await r.started();
      r.vm.selectFilter(PhotoFilter.vintage);
      r.vm.setAdjustValue(AdjustItem.shadows, 0.2);
      r.vm.updateCrop(_half);
      r.vm.selectTab(EditTab.filter);
      expect(r.state.tab, EditTab.filter);
      expect(r.state.filter, PhotoFilter.vintage);
      expect(r.state.layers.effective(AdjustItem.shadows), 0.2);
      expect(r.state.crop, _half);
    });
  });

  group('필터', () {
    _test('TC-EDIT-039 필터를 고르면 편집값에 반영된다', (r) async {
      await r.started();
      for (final f in PhotoFilter.values) {
        r.vm.selectFilter(f);
        expect(r.state.filter, f);
        expect(r.vm.currentEdit.filter, f);
      }
    });

    _test('REQ-EDIT-001 탭을 고르면 선택 탭이 바뀐다', (r) async {
      await r.started();
      r.vm.selectTab(EditTab.adjust);
      expect(r.state.tab, EditTab.adjust);
      r.vm.selectTab(EditTab.filter);
      expect(r.state.tab, EditTab.filter);
    });
  });
}

/// 자동 보정을 켠 채 완료했던 사진을 다시 연다(저장된 자동값 노출 0.7).
const _reedit = PhotoEdit(
  adjustments: AdjustmentLayers(
    autoValues: AdjustmentValues(exposure: 0.7),
    autoStrength: 1,
  ),
);
