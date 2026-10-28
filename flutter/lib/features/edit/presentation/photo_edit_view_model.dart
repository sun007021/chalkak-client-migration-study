import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/copy/ko.g.dart';
import '../domain/adjustment.dart';
import '../domain/auto_adjuster.dart';
import '../domain/crop_aspect_ratio.dart';
import '../domain/crop_geometry.dart';
import '../domain/crop_window.dart';
import '../domain/edit_source_loader.dart';
import '../domain/photo_edit.dart';
import '../domain/photo_edit_renderer.dart';
import '../domain/photo_filter.dart';
import '../domain/photo_transform.dart';
import '../domain/rgba_image.dart';

/// 편집기 하단 탭. 처음은 [crop](REQ-EDIT-001).
enum EditTab { crop, adjust, filter }

class PhotoEditState {
  const PhotoEditState({
    required this.tab,
    required this.ratio,
    required this.quarterTurns,
    required this.crop,
    required this.adjustItem,
    required this.layers,
    required this.filter,
    this.preview,
    this.isReady = false,
    this.isRendering = false,
    this.error,
  });

  final EditTab tab;
  final CropAspectRatio ratio;
  final int quarterTurns;

  /// 돌린 사진 기준 자르기 영역(화면 좌표계). 저장 모델 [PhotoEdit.crop]은 중심이 회전 전
  /// 원본 비율이므로 [PhotoEditViewModel.currentEdit]에서 `PhotoTransform`으로 변환한다.
  final CropWindow crop;
  final AdjustItem adjustItem;
  final AdjustmentLayers layers;
  final PhotoFilter filter;

  /// 미리보기 원본(로드 전 null).
  final RgbaImage? preview;

  /// 원본 로드가 끝났는가.
  final bool isReady;

  /// "완료" 렌더링 중(`photo-edit.rendering-indicator`).
  final bool isRendering;

  /// 렌더 실패 문구(`Copy.editErrorRender`). 닫기 전까지 유지.
  final String? error;

  PhotoEditState copyWith({
    EditTab? tab,
    CropAspectRatio? ratio,
    int? quarterTurns,
    CropWindow? crop,
    AdjustItem? adjustItem,
    AdjustmentLayers? layers,
    PhotoFilter? filter,
    RgbaImage? preview,
    bool? isReady,
    bool? isRendering,
    String? error,
    bool clearError = false,
  }) => PhotoEditState(
    tab: tab ?? this.tab,
    ratio: ratio ?? this.ratio,
    quarterTurns: quarterTurns ?? this.quarterTurns,
    crop: crop ?? this.crop,
    adjustItem: adjustItem ?? this.adjustItem,
    layers: layers ?? this.layers,
    filter: filter ?? this.filter,
    preview: preview ?? this.preview,
    isReady: isReady ?? this.isReady,
    isRendering: isRendering ?? this.isRendering,
    error: clearError ? null : (error ?? this.error),
  );
}

sealed class PhotoEditEvent {
  const PhotoEditEvent();
}

/// "완료". [edit]은 확정된 편집값, [rendered]는 업로드 화면에 보여 줄 편집 결과 미리보기.
final class EditDone extends PhotoEditEvent {
  const EditDone(this.edit, this.rendered);

  final PhotoEdit edit;
  final RgbaImage rendered;
}

/// "취소". 이번 편집의 모든 변경을 버린다(REQ-EDIT-003).
final class EditCancelled extends PhotoEditEvent {
  const EditCancelled();
}

/// 사진 편집기 상태(REQ-EDIT-001~027).
///
/// - [start]는 여러 번 불러도 원본 준비와 처음 자동 보정 분석을 한 번만 한다. 만들기만 해서는
///   렌더링하지 않는다(TC-EDIT-001).
/// - 시작 상태: 탭 자르기, 비율 자유, 회전 0, 전체 자르기, 조정 항목 자동·강도 0, 필터 원본.
///   [initial]이 있으면 그 값으로 시작한다(재편집, REQ-UPL-021).
/// - [onDonePressed]: 렌더 1회로 편집 결과를 만들어 [EditDone]을 낸다. 자르기가 전체와 1e-3
///   이내로 같으면 전체로, 자동 보정이 꺼져 있으면(강도 0) 자동값은 버리고 확정한다
///   (REQ-EDIT-004). 렌더가 실패하면 닫지 않고 `Copy.editErrorRender`를 [PhotoEditState.error]에
///   둔다. 렌더링 중 연타는 무시한다. 편집값만 넘기고 업로드 준비가 원본에서 다시 그린다.
/// - [onCancelPressed]: 렌더 없이 [EditCancelled]만 낸다.
/// - 자동 보정: 분석은 처음 열 때, 자르기를 바꾼 뒤 탭을 옮길 때, 자동 보정을 켠 채 완료할 때
///   자른 영역 기준으로 하되 같은 자르기로 이미 분석했으면 다시 하지 않는다(REQ-EDIT-025).
///   재편집으로 열 때 저장된 자동값이 있으면 그 값을 쓰고 재분석하지 않는다.
class PhotoEditViewModel extends ChangeNotifier {
  PhotoEditViewModel({
    required this.sourceBytes,
    required this.loader,
    required this.renderer,
    required this.analyzer,
    this.initial = PhotoEdit.identity,
  }) : _state = PhotoEditState(
         tab: EditTab.crop,
         ratio: CropAspectRatio.free,
         quarterTurns: initial.quarterTurns % 4,
         crop: _fromStored(initial.crop, initial.quarterTurns % 4),
         adjustItem: AdjustItem.auto,
         layers: initial.adjustments,
         filter: initial.filter,
       );

  final Uint8List sourceBytes;
  final PhotoEdit initial;
  final EditSourceLoader loader;
  final PhotoEditRenderer renderer;
  final AutoAdjustAnalyzer analyzer;

  final StreamController<PhotoEditEvent> _events =
      StreamController<PhotoEditEvent>.broadcast(sync: true);
  PhotoEditState _state;
  EditSource? _source;
  Future<void>? _starting;
  bool _disposed = false;

  /// 마지막으로 자동 보정을 분석(시작)한 자른 영역. 같은 영역이면 다시 분석하지 않는다.
  _RegionKey? _analyzedKey;
  Future<void>? _analysis;
  int _analysisToken = 0;

  PhotoEditState get state => _state;
  Stream<PhotoEditEvent> get events => _events.stream;

  /// 원본(편집 기준 크기) 준비가 끝났는가.
  EditSource? get source => _source;

  /// 돌린 사진 기준 자르기 기하. 준비 전에는 null.
  CropGeometry? get geometry {
    final src = _source;
    if (src == null) return null;
    final size = PhotoTransform.rotatedSize(
      _state.quarterTurns,
      sourceWidth: src.width,
      sourceHeight: src.height,
    );
    return CropGeometry(
      imageWidth: size.width.toDouble(),
      imageHeight: size.height.toDouble(),
    );
  }

  /// 프레임을 끌 때 지킬 가로 / 세로 비율. 자유와 준비 전에는 null.
  double? get cropAspect {
    final g = geometry;
    if (_state.ratio == CropAspectRatio.original) {
      return g == null ? null : g.imageWidth / g.imageHeight;
    }
    return _state.ratio.fixedRatio;
  }

  void _emit(PhotoEditState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }

  /// 지금까지의 확정 전 편집값(정규화 전).
  PhotoEdit get currentEdit => PhotoEdit(
    quarterTurns: _state.quarterTurns,
    crop: _toStored(_state.crop, _state.quarterTurns),
    filter: _state.filter,
    adjustments: _state.layers,
  );

  Future<void> start() => _starting ??= _start();

  Future<void> _start() async {
    try {
      final src = await loader.load(sourceBytes);
      if (_disposed) return;
      _source = src;
      _emit(_state.copyWith(preview: src.preview, isReady: true));
    } on Object {
      if (_disposed) return;
      _emit(_state.copyWith(error: Copy.editErrorRender));
      return;
    }
    // 재편집으로 열 때 저장된 자동값이 있으면 그대로 쓰고 다시 분석하지 않는다.
    if (!initial.adjustments.autoValues.isZero) {
      _analyzedKey = _regionKey();
      return;
    }
    await _refreshAutoAdjustments();
  }

  void selectTab(EditTab tab) {
    if (_state.tab != tab) _emit(_state.copyWith(tab: tab));
    // 자르기를 바꾼 뒤 탭을 옮기면 자른 영역 기준으로 분석한다(REQ-EDIT-025).
    unawaited(_refreshAutoAdjustments());
  }

  void selectRatio(CropAspectRatio ratio) {
    if (ratio == CropAspectRatio.free) {
      _emit(_state.copyWith(ratio: ratio));
      return;
    }
    final next = _state.copyWith(ratio: ratio);
    _state = next;
    final aspect = cropAspect;
    final g = geometry;
    if (g == null) {
      _emit(next);
      return;
    }
    _emit(next.copyWith(crop: g.largest(aspect)));
  }

  void updateCrop(CropWindow crop) => _emit(_state.copyWith(crop: crop));

  void rotate() {
    final g = geometry;
    if (g == null) return;
    final turns = (_state.quarterTurns + 1) % 4;
    final old = _state.crop;
    final fixed = _state.ratio.fixedRatio;
    final src = _source!;
    final size = PhotoTransform.rotatedSize(
      turns,
      sourceWidth: src.width,
      sourceHeight: src.height,
    );
    final CropWindow crop;
    if (fixed != null) {
      crop = CropGeometry(
        imageWidth: size.width.toDouble(),
        imageHeight: size.height.toDouble(),
      ).largest(fixed);
    } else {
      // 원본 비율·자유: 영역이 사진과 함께 시계 방향으로 돈다.
      crop = CropWindow(
        centerX: 1 - old.centerY,
        centerY: old.centerX,
        width: old.height,
        height: old.width,
      );
    }
    _emit(_state.copyWith(quarterTurns: turns, crop: crop));
  }

  void resetCrop() => _emit(
    _state.copyWith(
      quarterTurns: 0,
      crop: CropWindow.full,
      ratio: CropAspectRatio.free,
    ),
  );

  void selectAdjustItem(AdjustItem item) {
    var layers = _state.layers;
    if (item == AdjustItem.auto) {
      if (_state.adjustItem == AdjustItem.auto) {
        layers = layers.withAutoStrength(layers.autoStrength > 0 ? 0 : 1);
      } else if (layers.autoStrength == 0) {
        layers = layers.withAutoStrength(1);
      }
    }
    _emit(_state.copyWith(adjustItem: item, layers: layers));
  }

  void setAdjustValue(AdjustItem item, double value) {
    if (!item.isValue) return;
    _emit(
      _state.copyWith(
        layers: _state.layers.withValue(item, value.clamp(-1.0, 1.0)),
      ),
    );
  }

  void setAutoStrength(double strength) => _emit(
    _state.copyWith(
      layers: _state.layers.withAutoStrength(strength.clamp(0.0, 1.0)),
    ),
  );

  void resetAdjustments() =>
      _emit(_state.copyWith(layers: _state.layers.cleared()));

  void selectFilter(PhotoFilter filter) =>
      _emit(_state.copyWith(filter: filter));

  Future<void> onDonePressed() async {
    final preview = _state.preview;
    if (_state.isRendering || !_state.isReady || preview == null) return;
    _emit(_state.copyWith(isRendering: true, clearError: true));
    try {
      if (_state.layers.autoStrength > 0) await _refreshAutoAdjustments();
      final edit = _normalized(currentEdit);
      final rendered = await renderer.render(preview, edit);
      if (_disposed) return;
      _emit(_state.copyWith(isRendering: false));
      _events.add(EditDone(edit, rendered));
    } on Object {
      if (_disposed) return;
      _emit(_state.copyWith(isRendering: false, error: Copy.editErrorRender));
    }
  }

  void onCancelPressed() {
    if (_disposed) return;
    _events.add(const EditCancelled());
  }

  void dismissError() => _emit(_state.copyWith(clearError: true));

  /// 확정 전 정규화: 전체에 가까운 자르기는 전체로, 자동 보정이 꺼져 있으면 자동값을 버린다.
  PhotoEdit _normalized(PhotoEdit edit) {
    final layers = edit.adjustments;
    return PhotoEdit(
      quarterTurns: edit.quarterTurns,
      crop: edit.crop.isFull() ? CropWindow.full : edit.crop,
      filter: edit.filter,
      adjustments: layers.autoStrength > 0
          ? layers
          : AdjustmentLayers(userValues: layers.userValues),
    );
  }

  _RegionKey _regionKey() {
    final c = currentEdit.crop;
    // 홀수 회전이면 돌린 사진의 가로·세로 비율이 원본의 세로·가로에 해당한다.
    final odd = _state.quarterTurns.isOdd;
    double r(double v) => (v * 1e6).round() / 1e6;
    return _RegionKey(
      r(c.centerX),
      r(c.centerY),
      r(odd ? c.height : c.width),
      r(odd ? c.width : c.height),
    );
  }

  /// 자른 영역이 지난 분석과 다를 때만 그 영역으로 자동 보정값을 다시 구한다.
  Future<void> _refreshAutoAdjustments() async {
    final preview = _state.preview;
    if (preview == null || _disposed) return;
    final key = _regionKey();
    if (key != _analyzedKey) {
      _analyzedKey = key;
      final token = ++_analysisToken;
      final region = cropAndRotate(preview, currentEdit);
      _analysis = () async {
        try {
          final values = await analyzer.analyze(region);
          if (_disposed || token != _analysisToken) return;
          _emit(_state.copyWith(layers: _state.layers.withAutoValues(values)));
        } on Object {
          // 분석할 수 없으면 자동 보정은 아무것도 바꾸지 않는다(REQ-EDIT-027).
          if (!_disposed && token == _analysisToken) _analyzedKey = null;
        }
      }();
    }
    await _analysis;
  }

  @override
  void dispose() {
    _disposed = true;
    _events.close();
    super.dispose();
  }

  // 회전 전 원본 비율 중심 <-> 돌린 사진 비율 중심.
  static CropWindow _fromStored(CropWindow c, int turns) {
    final (x, y) = switch (turns % 4) {
      1 => (1 - c.centerY, c.centerX),
      2 => (1 - c.centerX, 1 - c.centerY),
      3 => (c.centerY, 1 - c.centerX),
      _ => (c.centerX, c.centerY),
    };
    return CropWindow(centerX: x, centerY: y, width: c.width, height: c.height);
  }

  static CropWindow _toStored(CropWindow c, int turns) {
    final (x, y) = switch (turns % 4) {
      1 => (c.centerY, 1 - c.centerX),
      2 => (1 - c.centerX, 1 - c.centerY),
      3 => (1 - c.centerY, c.centerX),
      _ => (c.centerX, c.centerY),
    };
    return CropWindow(centerX: x, centerY: y, width: c.width, height: c.height);
  }
}

class _RegionKey {
  const _RegionKey(this.cx, this.cy, this.w, this.h);

  final double cx;
  final double cy;
  final double w;
  final double h;

  @override
  bool operator ==(Object other) =>
      other is _RegionKey &&
      other.cx == cx &&
      other.cy == cy &&
      other.w == w &&
      other.h == h;

  @override
  int get hashCode => Object.hash(cx, cy, w, h);
}
