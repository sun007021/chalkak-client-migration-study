import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import '../../../core/copy/ko.g.dart';
import '../domain/record_calendar_grid.dart';
import '../domain/record_calendar_image.dart';
import '../domain/record_models.dart';
import 'http_calendar_thumbnail_loader.dart';

/// 썸네일 URL의 바이트를 받는다. 받지 못하면 null이고, 그 칸은 사진 대신 색 칸으로 그린다.

/// `dart:ui`로 달력을 PNG로 그리는 [CalendarImageRenderer]. 월 제목, 요일 머리글, 날짜 숫자,
/// 사진이 있는 날 표시를 담는다. 썸네일은 받을 수 있는 것만 담고 못 받은 칸은 색 칸으로 둔다
/// (썸네일 포함 여부는 spec 확인 필요 항목이라 저장 자체를 실패시키지 않는다).
class PngCalendarImageRenderer implements CalendarImageRenderer {
  const PngCalendarImageRenderer({this.thumbnailLoader = _defaultLoader});

  static Future<Uint8List?> _defaultLoader(String url) =>
      const HttpCalendarThumbnailLoader()(url);

  final CalendarThumbnailLoader thumbnailLoader;

  static const double _width = 1080;
  static const double _margin = 48;
  static const double _gap = 8;
  static const double _titleHeight = 160;
  static const double _weekdayHeight = 72;
  static const Duration _loadTimeout = Duration(seconds: 10);

  static const ui.Color _background = ui.Color(0xFFFFFFFF);
  static const ui.Color _ink = ui.Color(0xFF1B1B1F);
  static const ui.Color _muted = ui.Color(0xFF8A8A92);
  static const ui.Color _emptyCell = ui.Color(0xFFF1F1F4);
  static const ui.Color _scrim = ui.Color(0xB3000000);
  static const ui.Color _onScrim = ui.Color(0xFFFFFFFF);

  @override
  Future<Uint8List> render(RecordCalendarImageSpec spec) async {
    final grid = RecordCalendarGrid(spec.month);
    final photos = {for (final p in spec.photos) p.topicDate: p};
    final images = await _loadImages(spec.photos);
    try {
      const cellWidth = (_width - _margin * 2 - _gap * 6) / 7;
      const cellHeight = cellWidth * 4 / 3;
      final height =
          _margin +
          _titleHeight +
          _weekdayHeight +
          grid.rowCount * (cellHeight + _gap) +
          _margin;

      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder);
      canvas.drawRect(
        ui.Rect.fromLTWH(0, 0, _width, height),
        ui.Paint()..color = _background,
      );
      _drawText(
        canvas,
        spec.month.recordLabel,
        const ui.Rect.fromLTWH(_margin, _margin, _width - _margin * 2, 110),
        size: 72,
        color: _ink,
        weight: ui.FontWeight.w700,
        align: ui.TextAlign.center,
      );
      const gridTop = _margin + _titleHeight;
      for (var i = 0; i < 7; i++) {
        _drawText(
          canvas,
          Copy.recordWeekday[i],
          ui.Rect.fromLTWH(
            _margin + i * (cellWidth + _gap),
            gridTop,
            cellWidth,
            _weekdayHeight,
          ),
          size: 36,
          color: _muted,
          align: ui.TextAlign.center,
        );
      }
      final cells = grid.cells;
      for (var index = 0; index < cells.length; index++) {
        final date = cells[index];
        if (date == null) continue;
        final rect = ui.Rect.fromLTWH(
          _margin + (index % 7) * (cellWidth + _gap),
          gridTop + _weekdayHeight + (index ~/ 7) * (cellHeight + _gap),
          cellWidth,
          cellHeight,
        );
        final photo = photos[date];
        _drawCell(canvas, rect, date.day, photo, images[photo?.postId]);
      }

      final picture = recorder.endRecording();
      try {
        final image = await picture.toImage(_width.toInt(), height.ceil());
        try {
          final data = await image.toByteData(format: ui.ImageByteFormat.png);
          if (data == null) throw StateError('PNG 인코딩 결과가 없다');
          return data.buffer.asUint8List(
            data.offsetInBytes,
            data.lengthInBytes,
          );
        } finally {
          image.dispose();
        }
      } finally {
        picture.dispose();
      }
    } finally {
      for (final image in images.values) {
        image.dispose();
      }
    }
  }

  void _drawCell(
    ui.Canvas canvas,
    ui.Rect rect,
    int day,
    RecordPhoto? photo,
    ui.Image? image,
  ) {
    final shape = ui.RRect.fromRectAndRadius(
      rect,
      const ui.Radius.circular(14),
    );
    canvas.save();
    canvas.clipRRect(shape);
    canvas.drawRect(rect, ui.Paint()..color = _emptyCell);
    if (image != null) _drawCover(canvas, rect, image);
    final hasPhoto = photo != null;
    if (hasPhoto) {
      // 날짜 숫자가 사진 위에서도 읽히도록 아래에 띠를 깐다.
      final band = ui.Rect.fromLTWH(
        rect.left,
        rect.bottom - 52,
        rect.width,
        52,
      );
      canvas.drawRect(band, ui.Paint()..color = _scrim);
      if (photo.isPending) {
        _drawText(
          canvas,
          Copy.recordPendingBadge,
          ui.Rect.fromLTWH(rect.left, rect.top + 8, rect.width, 40),
          size: 22,
          color: _onScrim,
          align: ui.TextAlign.center,
          background: _scrim,
        );
      }
    }
    _drawText(
      canvas,
      '$day',
      hasPhoto
          ? ui.Rect.fromLTWH(rect.left, rect.bottom - 52, rect.width, 52)
          : ui.Rect.fromLTWH(rect.left, rect.top + 8, rect.width, 52),
      size: 30,
      color: hasPhoto ? _onScrim : _muted,
      weight: hasPhoto ? ui.FontWeight.w700 : ui.FontWeight.w400,
      align: ui.TextAlign.center,
    );
    canvas.restore();
  }

  /// 칸을 꽉 채우도록 가운데를 잘라 그린다.
  void _drawCover(ui.Canvas canvas, ui.Rect target, ui.Image image) {
    final iw = image.width.toDouble();
    final ih = image.height.toDouble();
    final scale = _max(target.width / iw, target.height / ih);
    final sw = target.width / scale;
    final sh = target.height / scale;
    final source = ui.Rect.fromLTWH((iw - sw) / 2, (ih - sh) / 2, sw, sh);
    canvas.drawImageRect(
      image,
      source,
      target,
      ui.Paint()..filterQuality = ui.FilterQuality.medium,
    );
  }

  static double _max(double a, double b) => a > b ? a : b;

  void _drawText(
    ui.Canvas canvas,
    String text,
    ui.Rect box, {
    required double size,
    required ui.Color color,
    ui.FontWeight weight = ui.FontWeight.w400,
    ui.TextAlign align = ui.TextAlign.left,
    ui.Color? background,
  }) {
    final builder =
        ui.ParagraphBuilder(
            ui.ParagraphStyle(
              textAlign: align,
              fontSize: size,
              fontWeight: weight,
              maxLines: 1,
              ellipsis: '…',
            ),
          )
          ..pushStyle(
            ui.TextStyle(
              color: color,
              fontSize: size,
              fontWeight: weight,
              background: background == null
                  ? null
                  : (ui.Paint()..color = background),
            ),
          )
          ..addText(text);
    final paragraph = builder.build()
      ..layout(ui.ParagraphConstraints(width: box.width));
    final dy = box.top + (box.height - paragraph.height) / 2;
    canvas.drawParagraph(paragraph, ui.Offset(box.left, dy));
    paragraph.dispose();
  }

  /// postId별 썸네일 이미지. 못 받거나 해독하지 못한 사진은 빠진다.
  Future<Map<String, ui.Image>> _loadImages(List<RecordPhoto> photos) async {
    final loaded = await Future.wait([
      for (final photo in photos) _loadImage(photo.thumbnailImageUrl),
    ]);
    return {
      for (var i = 0; i < photos.length; i++)
        if (loaded[i] != null) photos[i].postId: loaded[i]!,
    };
  }

  Future<ui.Image?> _loadImage(String url) async {
    try {
      final bytes = await thumbnailLoader(url).timeout(_loadTimeout);
      if (bytes == null || bytes.isEmpty) return null;
      final codec = await ui.instantiateImageCodec(bytes);
      try {
        return (await codec.getNextFrame()).image;
      } finally {
        codec.dispose();
      }
    } on Object {
      return null;
    }
  }
}
