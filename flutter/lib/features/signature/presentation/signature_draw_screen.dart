import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/test_id.dart';
import '../data/signature_path.dart';
import '../domain/signature_drawing.dart';
import 'signature_draw_view_model.dart';
import 'signature_test_ids.dart';

/// 사인 그리기 화면. testids: `signature.root`(mode를 Semantics value로 노출: `onboarding`/`change`),
/// `signature.title`, `signature.guide-text`, `signature.canvas`(드래그 = 획),
/// `signature.canvas-hint`(획이 없을 때만 존재), `signature.undo-button`·`signature.clear-button`·
/// `signature.submit-button`(획이 없으면 enabled=false), `signature.back-button`,
/// `signature.error-message`(오류가 있을 때만 존재).
/// 문구는 `onb.sign.*`. 캔버스에는 흰 획이 보이는 어두운 배경을 쓴다.
/// 시작 시 [SignatureDrawViewModel.onShown]을 부르고, 이벤트는 [onEvent]로 넘긴다.
class SignatureDrawScreen extends StatefulWidget {
  const SignatureDrawScreen({
    super.key,
    required this.viewModel,
    required this.onEvent,
  });

  final SignatureDrawViewModel viewModel;
  final void Function(SignatureDrawEvent event) onEvent;

  @override
  State<SignatureDrawScreen> createState() => _SignatureDrawScreenState();
}

class _SignatureDrawScreenState extends State<SignatureDrawScreen> {
  StreamSubscription<SignatureDrawEvent>? _events;

  @override
  void initState() {
    super.initState();
    _attach();
  }

  @override
  void didUpdateWidget(SignatureDrawScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.viewModel != widget.viewModel) {
      _events?.cancel();
      _attach();
    }
  }

  void _attach() {
    _events = widget.viewModel.events.listen(_onEvent);
    widget.viewModel.onShown();
  }

  @override
  void dispose() {
    _events?.cancel();
    super.dispose();
  }

  void _onEvent(SignatureDrawEvent event) {
    if (mounted) widget.onEvent(event);
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = widget.viewModel;
    // 시스템 뒤로 가기도 화면의 뒤로 버튼과 같은 이벤트로 처리한다.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) viewModel.onBackPressed();
      },
      child: Semantics(
        key: const Key(SignatureTestIds.drawRoot),
        identifier: SignatureTestIds.drawRoot,
        value: viewModel.mode.name,
        container: true,
        child: Scaffold(
          body: SafeArea(
            child: ListenableBuilder(
              listenable: viewModel,
              builder: (context, _) => _Content(viewModel: viewModel),
            ),
          ),
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.viewModel});

  final SignatureDrawViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final state = viewModel.state;
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: TestId.button(
              SignatureTestIds.drawBackButton,
              child: IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: viewModel.onBackPressed,
              ),
            ),
          ),
          TestId(
            SignatureTestIds.drawTitle,
            child: Text(Copy.onbSignTitle, style: textTheme.headlineSmall),
          ),
          const SizedBox(height: 8),
          TestId(
            SignatureTestIds.drawGuideText,
            child: Text(Copy.onbSignGuide, style: textTheme.bodyMedium),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: Center(
              // PNG와 같은 2:1 비율로 그려야 화면에서 본 모양이 그대로 결과가 된다.
              child: AspectRatio(
                aspectRatio: 2,
                child: _Canvas(viewModel: viewModel),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TestId.button(
                  SignatureTestIds.drawUndoButton,
                  child: OutlinedButton(
                    onPressed: state.canUndo ? viewModel.undo : null,
                    child: const Text(Copy.onbSignUndo),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TestId.button(
                  SignatureTestIds.drawClearButton,
                  child: OutlinedButton(
                    onPressed: state.canClear ? viewModel.clear : null,
                    child: const Text(Copy.onbSignClear),
                  ),
                ),
              ),
            ],
          ),
          SizedBox(
            height: 40,
            child: state.error == null
                ? null
                : Center(
                    child: TestId(
                      SignatureTestIds.drawErrorMessage,
                      child: Text(
                        state.error!.text,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  ),
          ),
          TestId.button(
            SignatureTestIds.drawSubmitButton,
            child: FilledButton(
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              onPressed: state.canConfirm ? viewModel.onConfirmPressed : null,
              child: const Text(Copy.onbSignConfirm),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

/// 어두운 배경에 흰 획을 그리는 영역. 손가락을 대는 즉시 획이 시작되도록 raw 포인터를 쓴다
/// (탭 한 번이면 점 하나). 첫 손가락만 인식한다.
class _Canvas extends StatefulWidget {
  const _Canvas({required this.viewModel});

  final SignatureDrawViewModel viewModel;

  @override
  State<_Canvas> createState() => _CanvasState();
}

class _CanvasState extends State<_Canvas> {
  static const _background = Color(0xFF2B2B30);
  static const _strokeWidth = 5.0;

  int? _activePointer;

  SignatureDrawViewModel get _vm => widget.viewModel;

  void _onDown(PointerDownEvent e) {
    if (_activePointer != null) return;
    _activePointer = e.pointer;
    _vm.onStrokeStart(e.localPosition.dx, e.localPosition.dy);
  }

  void _onMove(PointerMoveEvent e) {
    if (e.pointer != _activePointer) return;
    _vm.onStrokeUpdate(e.localPosition.dx, e.localPosition.dy);
  }

  void _onUp(PointerEvent e) {
    if (e.pointer != _activePointer) return;
    _activePointer = null;
    _vm.onStrokeEnd();
  }

  @override
  Widget build(BuildContext context) {
    return TestId(
      SignatureTestIds.drawCanvas,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: LayoutBuilder(
          builder: (context, constraints) {
            _syncCanvasSize(constraints.biggest);
            return Listener(
              behavior: HitTestBehavior.opaque,
              onPointerDown: _onDown,
              onPointerMove: _onMove,
              onPointerUp: _onUp,
              onPointerCancel: _onUp,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ListenableBuilder(
                    listenable: _vm,
                    builder: (context, _) => CustomPaint(
                      painter: _StrokePainter(
                        drawing: _vm.state.drawing,
                        strokeWidth: _strokeWidth,
                      ),
                      child: const SizedBox.expand(),
                    ),
                  ),
                  ListenableBuilder(
                    listenable: _vm,
                    builder: (context, _) => _vm.state.drawing.hasSignature
                        ? const SizedBox.shrink()
                        : const IgnorePointer(
                            child: Center(
                              child: TestId(
                                SignatureTestIds.drawCanvasHint,
                                child: Text(
                                  Copy.onbSignPadHint,
                                  style: TextStyle(color: Colors.white54),
                                ),
                              ),
                            ),
                          ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  /// 레이아웃이 정해지거나 바뀌면 좌표 보정 영역을 갱신한다(빌드 도중 알리지 않도록 다음 프레임에).
  void _syncCanvasSize(Size size) {
    final drawing = _vm.state.drawing;
    if (drawing.width == size.width && drawing.height == size.height) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _vm.onCanvasSizeChanged(size.width, size.height);
    });
  }
}

class _StrokePainter extends CustomPainter {
  _StrokePainter({required this.drawing, required this.strokeWidth});

  final SignatureDrawing drawing;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = _CanvasState._background,
    );
    final line = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..isAntiAlias = true;
    final dot = Paint()..color = Colors.white;
    for (final stroke in drawing.strokes) {
      final points = stroke.points;
      if (points.isEmpty) continue;
      if (points.every((p) => p == points.first)) {
        canvas.drawCircle(
          Offset(points.first.x, points.first.y),
          strokeWidth / 2,
          dot,
        );
      } else {
        canvas.drawPath(SignaturePath.smooth(points), line);
      }
    }
  }

  @override
  bool shouldRepaint(_StrokePainter old) => old.drawing != drawing;
}
