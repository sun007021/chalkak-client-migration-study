import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/selectable_test_id.dart';
import '../../../core/ui/test_id.dart';
import '../domain/adjustment.dart';
import '../domain/color_pipeline.dart';
import '../domain/crop_aspect_ratio.dart';
import '../domain/crop_geometry.dart';
import '../domain/photo_filter.dart';
import '../domain/rgba_image.dart';
import 'crop_overlay.dart';
import 'photo_edit_test_ids.dart';
import 'photo_edit_view_model.dart';
import 'rgba_image_view.dart';
import 'ruler_slider.dart';

/// 사진 편집기 전체 화면(REQ-EDIT-001). 업로드 화면 위에 띄우는 내비게이션 목적지가 아닌 화면이다.
/// - 상단 "취소"/"완료", 사진 미리보기, 하단 탭 "자르기"/"조정"/"필터"(처음은 자르기, 선택 탭은 selected).
/// - 자르기 탭: 비율 버튼 9종(선택은 selected), "90도 회전", "초기화", 자르기 프레임.
/// - 조정 탭: 항목 줄(자동, 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함), 눈금자 슬라이더
///   (표시값 -100~100), 자동 보정 토글(checked)·강도, "초기화".
/// - 필터 탭: 필터 6종(선택은 selected).
/// - 렌더링 중 `photo-edit.rendering-indicator`, 렌더 실패 시 `photo-edit.error-dialog`에
///   `Copy.editErrorRender`. 상태 표시 요소는 해당 상태일 때만 트리에 존재한다.
/// ViewModel의 [PhotoEditViewModel.start]는 화면이 부른다.
class PhotoEditScreen extends StatefulWidget {
  const PhotoEditScreen({super.key, required this.viewModel});

  final PhotoEditViewModel viewModel;

  @override
  State<PhotoEditScreen> createState() => _PhotoEditScreenState();
}

class _PhotoEditScreenState extends State<PhotoEditScreen> {
  @override
  void initState() {
    super.initState();
    unawaited(widget.viewModel.start());
  }

  @override
  Widget build(BuildContext context) {
    final vm = widget.viewModel;
    // 사진 편집기는 어두운 배경에서 색을 보는 화면이라 앱 테마와 별개로 어둡게 쓴다.
    final theme = ThemeData(
      brightness: Brightness.dark,
      colorScheme: ColorScheme.fromSeed(
        seedColor: Theme.of(context).colorScheme.primary,
        brightness: Brightness.dark,
      ),
    );
    return Theme(
      data: theme,
      // 시스템 뒤로 가기도 "취소"와 같다(렌더링 중에는 무시).
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop && !vm.state.isRendering) vm.onCancelPressed();
        },
        child: TestId(
          PhotoEditTestIds.root,
          child: Scaffold(
            body: SafeArea(
              child: ListenableBuilder(
                listenable: vm,
                builder: (context, _) => Stack(
                  children: [
                    Column(
                      children: [
                        _TopBar(viewModel: vm),
                        Expanded(child: _PreviewArea(viewModel: vm)),
                        _ToolPanel(viewModel: vm),
                        _TabBar(viewModel: vm),
                      ],
                    ),
                    if (vm.state.isRendering) const _RenderingOverlay(),
                    if (vm.state.error != null)
                      _ErrorOverlay(
                        message: vm.state.error!,
                        onClose: vm.dismissError,
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.viewModel});

  final PhotoEditViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final s = viewModel.state;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          TestId.button(
            PhotoEditTestIds.cancelButton,
            child: TextButton(
              onPressed: s.isRendering ? null : viewModel.onCancelPressed,
              child: const Text(Copy.editTopCancel),
            ),
          ),
          TestId.button(
            PhotoEditTestIds.doneButton,
            child: TextButton(
              onPressed: s.isReady && !s.isRendering
                  ? viewModel.onDonePressed
                  : null,
              child: const Text(Copy.editTopDone),
            ),
          ),
        ],
      ),
    );
  }
}

class _RenderingOverlay extends StatelessWidget {
  const _RenderingOverlay();

  @override
  Widget build(BuildContext context) {
    return const Positioned.fill(
      child: AbsorbPointer(
        child: ColoredBox(
          color: Colors.black45,
          child: Center(
            child: TestId(
              PhotoEditTestIds.renderingIndicator,
              child: CircularProgressIndicator(),
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorOverlay extends StatelessWidget {
  const _ErrorOverlay({required this.message, required this.onClose});

  final String message;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: ColoredBox(
        color: Colors.black54,
        child: Center(
          child: TestId(
            PhotoEditTestIds.errorDialog,
            child: Card(
              margin: const EdgeInsets.symmetric(horizontal: 32),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(message, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: onClose,
                      child: const Text(Copy.commonConfirm),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- 미리보기

class _PreviewArea extends StatelessWidget {
  const _PreviewArea({required this.viewModel});

  final PhotoEditViewModel viewModel;

  static const _margin = 14.0;

  @override
  Widget build(BuildContext context) {
    final s = viewModel.state;
    final geometry = viewModel.geometry;
    final preview = s.preview;
    return TestId(
      PhotoEditTestIds.previewImage,
      child: LayoutBuilder(
        builder: (context, constraints) {
          if (geometry == null || preview == null) {
            return const Center(child: CircularProgressIndicator());
          }
          final viewport = CropViewport(
            imageSize: Size(geometry.imageWidth, geometry.imageHeight),
            boxSize: Size(
              math.max(1, constraints.maxWidth - _margin * 2),
              math.max(1, constraints.maxHeight - _margin * 2),
            ),
            handleMargin: _margin,
          );
          final display = viewport.displaySize;
          final inCropTab = s.tab == EditTab.crop;
          final overlay = CropOverlay(
            viewport: viewport,
            geometry: geometry,
            crop: s.crop,
            aspect: viewModel.cropAspect,
            interactive: inCropTab,
            onChanged: viewModel.updateCrop,
          );
          return Center(
            child: SizedBox.fromSize(
              size: viewport.viewSize,
              child: Stack(
                children: [
                  Positioned(
                    left: _margin,
                    top: _margin,
                    width: display.width,
                    height: display.height,
                    child: RotatedBox(
                      quarterTurns: s.quarterTurns,
                      child: _LivePreview(
                        image: preview,
                        adjustments: s.layers.effectiveValues,
                        filter: s.filter,
                      ),
                    ),
                  ),
                  Positioned.fill(
                    child: inCropTab
                        ? TestId(PhotoEditTestIds.cropArea, child: overlay)
                        : overlay,
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// 조정·필터를 입힌 미리보기. 화면용으로 줄인 사본에 최종 렌더링과 같은 색 계산을 적용한다
/// (REQ-EDIT-002). 값이 바뀌면 마지막 값 하나로 합쳐 다시 계산한다.
class _LivePreview extends StatefulWidget {
  const _LivePreview({
    required this.image,
    required this.adjustments,
    required this.filter,
  });

  final RgbaImage image;
  final AdjustmentValues adjustments;
  final PhotoFilter filter;

  @override
  State<_LivePreview> createState() => _LivePreviewState();
}

class _LivePreviewState extends State<_LivePreview> {
  static const _proxyLongEdge = 720;

  RgbaImage? _proxy;
  ui.Image? _shown;
  bool _busy = false;
  bool _dirty = false;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void didUpdateWidget(_LivePreview old) {
    super.didUpdateWidget(old);
    if (!identical(old.image, widget.image)) _proxy = null;
    if (!identical(old.image, widget.image) ||
        old.adjustments != widget.adjustments ||
        old.filter != widget.filter) {
      _refresh();
    }
  }

  Future<void> _refresh() async {
    if (_busy) {
      _dirty = true;
      return;
    }
    _busy = true;
    try {
      do {
        _dirty = false;
        final source = widget.image;
        final proxy = _proxy ??= _downscale(source);
        final adjustments = widget.adjustments;
        final filter = widget.filter;
        if (proxy.rgba.length < proxy.width * proxy.height * 4) return;
        final colored = adjustments.isZero && filter == PhotoFilter.original
            ? proxy
            : PhotoColorPipeline.apply(
                proxy,
                adjustments: adjustments,
                filter: filter,
              );
        final decoded = await decodeRgbaImage(colored);
        if (!mounted) {
          decoded?.dispose();
          return;
        }
        final old = _shown;
        setState(() => _shown = decoded);
        if (old != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
        }
      } while (_dirty);
    } finally {
      _busy = false;
    }
  }

  static RgbaImage _downscale(RgbaImage image) {
    final longEdge = math.max(image.width, image.height);
    if (longEdge <= _proxyLongEdge ||
        image.rgba.length < image.width * image.height * 4) {
      return image;
    }
    final scale = _proxyLongEdge / longEdge;
    final w = math.max(1, (image.width * scale).round());
    final h = math.max(1, (image.height * scale).round());
    final out = Uint8List(w * h * 4);
    for (var y = 0; y < h; y++) {
      final sy = math.min(image.height - 1, ((y + 0.5) / scale).floor());
      for (var x = 0; x < w; x++) {
        final sx = math.min(image.width - 1, ((x + 0.5) / scale).floor());
        final so = (sy * image.width + sx) * 4;
        final d = (y * w + x) * 4;
        out.setRange(d, d + 4, image.rgba, so);
      }
    }
    return RgbaImage(width: w, height: h, rgba: out);
  }

  @override
  void dispose() {
    _shown?.dispose();
    _shown = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shown = _shown;
    if (shown == null) return const ColoredBox(color: Colors.black26);
    return RawImage(image: shown, fit: BoxFit.fill);
  }
}

// ---------------------------------------------------------------- 도구 패널

class _ToolPanel extends StatelessWidget {
  const _ToolPanel({required this.viewModel});

  final PhotoEditViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 164,
      child: switch (viewModel.state.tab) {
        EditTab.crop => _CropTools(viewModel: viewModel),
        EditTab.adjust => _AdjustTools(viewModel: viewModel),
        EditTab.filter => _FilterTools(viewModel: viewModel),
      },
    );
  }
}

class _ChipButton extends StatelessWidget {
  const _ChipButton({
    required this.id,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String id;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SelectableTestId(
      id,
      selected: selected,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            color: selected ? scheme.primary : scheme.surfaceContainerHighest,
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? scheme.onPrimary : scheme.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class _ChipRow extends StatelessWidget {
  const _ChipRow({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          for (final c in children)
            Padding(padding: const EdgeInsets.only(right: 8), child: c),
        ],
      ),
    );
  }
}

class _CropTools extends StatelessWidget {
  const _CropTools({required this.viewModel});

  final PhotoEditViewModel viewModel;

  static const _ids = {
    CropAspectRatio.original: PhotoEditTestIds.ratioOriginal,
    CropAspectRatio.free: PhotoEditTestIds.ratioFree,
    CropAspectRatio.r1x1: PhotoEditTestIds.ratio1x1,
    CropAspectRatio.r4x5: PhotoEditTestIds.ratio4x5,
    CropAspectRatio.r5x4: PhotoEditTestIds.ratio5x4,
    CropAspectRatio.r3x4: PhotoEditTestIds.ratio3x4,
    CropAspectRatio.r4x3: PhotoEditTestIds.ratio4x3,
    CropAspectRatio.r9x16: PhotoEditTestIds.ratio9x16,
    CropAspectRatio.r16x9: PhotoEditTestIds.ratio16x9,
  };

  @override
  Widget build(BuildContext context) {
    final s = viewModel.state;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _ChipRow(
          children: [
            for (final r in CropAspectRatio.values)
              _ChipButton(
                id: _ids[r]!,
                label: r.label,
                selected: s.ratio == r,
                onTap: () => viewModel.selectRatio(r),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            TestId.button(
              PhotoEditTestIds.rotateButton,
              child: TextButton.icon(
                onPressed: viewModel.rotate,
                icon: const Icon(Icons.rotate_90_degrees_cw_outlined),
                label: const Text(Copy.editCropRotate),
              ),
            ),
            TestId.button(
              PhotoEditTestIds.resetButton,
              child: TextButton(
                onPressed: viewModel.resetCrop,
                child: const Text(Copy.editCropReset),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _AdjustTools extends StatelessWidget {
  const _AdjustTools({required this.viewModel});

  final PhotoEditViewModel viewModel;

  static String _sliderId(AdjustItem item) => switch (item) {
    AdjustItem.auto => PhotoEditTestIds.adjustAutoStrengthSlider,
    AdjustItem.exposure => PhotoEditTestIds.adjustExposureSlider,
    AdjustItem.contrast => PhotoEditTestIds.adjustContrastSlider,
    AdjustItem.highlights => PhotoEditTestIds.adjustHighlightsSlider,
    AdjustItem.shadows => PhotoEditTestIds.adjustShadowsSlider,
    AdjustItem.blackPoint => PhotoEditTestIds.adjustBlackPointSlider,
    AdjustItem.saturation => PhotoEditTestIds.adjustSaturationSlider,
    AdjustItem.warmth => PhotoEditTestIds.adjustWarmthSlider,
  };

  @override
  Widget build(BuildContext context) {
    final s = viewModel.state;
    final item = s.adjustItem;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Row(
          children: [
            Expanded(
              child: _ChipRow(
                children: [
                  for (final i in AdjustItem.values)
                    _AdjustChip(
                      item: i,
                      selected: item == i,
                      onTap: () => viewModel.selectAdjustItem(i),
                    ),
                ],
              ),
            ),
            TestId.button(
              PhotoEditTestIds.resetButton,
              child: TextButton(
                onPressed: viewModel.resetAdjustments,
                child: const Text(Copy.editAdjustReset),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: item == AdjustItem.auto
              ? _AutoControls(viewModel: viewModel)
              : RulerSlider(
                  id: _sliderId(item),
                  value: s.layers.effective(item),
                  detents: [0, s.layers.autoShare(item)],
                  onChanged: (v) => viewModel.setAdjustValue(item, v),
                ),
        ),
      ],
    );
  }
}

class _AdjustChip extends StatelessWidget {
  const _AdjustChip({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final AdjustItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // 항목 줄의 칩은 testID 표에 없다. 선택 상태는 색으로만 드러낸다.
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Semantics(
        selected: selected,
        button: true,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            color: selected ? scheme.primary : scheme.surfaceContainerHighest,
          ),
          child: Text(
            item.label,
            style: TextStyle(
              color: selected ? scheme.onPrimary : scheme.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class _AutoControls extends StatelessWidget {
  const _AutoControls({required this.viewModel});

  final PhotoEditViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final strength = viewModel.state.layers.autoStrength;
    final on = strength > 0;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        MergeSemantics(
          key: const Key(PhotoEditTestIds.adjustAutoToggle),
          child: Semantics(
            identifier: PhotoEditTestIds.adjustAutoToggle,
            checked: on,
            button: true,
            child: InkWell(
              onTap: () => viewModel.setAutoStrength(on ? 0 : 1),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text(Copy.editAdjustAuto),
                  const SizedBox(width: 8),
                  ExcludeSemantics(
                    child: IgnorePointer(
                      child: Switch(value: on, onChanged: (_) {}),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        TestId(
          PhotoEditTestIds.adjustAutoStrengthSlider,
          child: Slider(
            value: strength.clamp(0.0, 1.0),
            onChanged: viewModel.setAutoStrength,
          ),
        ),
      ],
    );
  }
}

class _FilterTools extends StatelessWidget {
  const _FilterTools({required this.viewModel});

  final PhotoEditViewModel viewModel;

  static const _ids = {
    PhotoFilter.original: PhotoEditTestIds.filterOriginal,
    PhotoFilter.mono: PhotoEditTestIds.filterMono,
    PhotoFilter.warm: PhotoEditTestIds.filterWarm,
    PhotoFilter.cool: PhotoEditTestIds.filterCool,
    PhotoFilter.vintage: PhotoEditTestIds.filterVintage,
    PhotoFilter.vivid: PhotoEditTestIds.filterVivid,
  };

  @override
  Widget build(BuildContext context) {
    final selected = viewModel.state.filter;
    return Center(
      child: _ChipRow(
        children: [
          for (final f in PhotoFilter.values)
            _ChipButton(
              id: _ids[f]!,
              label: f.label,
              selected: selected == f,
              onTap: () => viewModel.selectFilter(f),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- 탭 줄

class _TabBar extends StatelessWidget {
  const _TabBar({required this.viewModel});

  final PhotoEditViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final tab = viewModel.state.tab;
    Widget item(String id, EditTab value, IconData icon, String label) {
      final selected = tab == value;
      final color = selected
          ? Theme.of(context).colorScheme.primary
          : Theme.of(context).colorScheme.onSurfaceVariant;
      return Expanded(
        child: SelectableTestId(
          id,
          selected: selected,
          child: InkWell(
            onTap: () => viewModel.selectTab(value),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, color: color),
                  const SizedBox(height: 2),
                  Text(label, style: TextStyle(color: color, fontSize: 12)),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Row(
      children: [
        item(
          PhotoEditTestIds.tabCrop,
          EditTab.crop,
          Icons.crop,
          Copy.editTabCrop,
        ),
        item(
          PhotoEditTestIds.tabAdjust,
          EditTab.adjust,
          Icons.tune,
          Copy.editTabAdjust,
        ),
        item(
          PhotoEditTestIds.tabFilter,
          EditTab.filter,
          Icons.auto_awesome_outlined,
          Copy.editTabFilter,
        ),
      ],
    );
  }
}
