import 'package:flutter/material.dart';

import '../../../core/ui/app_network_image.dart';
import '../../../core/ui/test_id.dart';
import 'feed_test_ids.dart';

/// 상세의 원본 사진과 그 위의 작가 사인.
///
/// 사진은 [BoxFit.contain]으로 영역 안에 그려지므로 가로 사진은 위아래에 빈 띠가 생긴다. 사인은 영역이
/// 아니라 **실제로 그려진 사진의 오른쪽 아래**에 둔다(REQ-FEED-003 "원본 사진 위의 작가 사인").
/// 사진 크기는 이미지 스트림에서 읽고, 아직 모르거나 읽지 못하면 영역의 오른쪽 아래에 둔다.
class SignedPhoto extends StatefulWidget {
  const SignedPhoto({
    super.key,
    required this.photoUrl,
    required this.signatureUrl,
    this.semanticLabel,
    @visibleForTesting this.photoProvider,
  });

  final String photoUrl;
  final String? signatureUrl;
  final String? semanticLabel;

  /// 크기를 읽을 이미지. 없으면 [photoUrl]의 네트워크 이미지(테스트에서만 바꾼다).
  final ImageProvider? photoProvider;

  /// 사진 가장자리에서 사인까지의 간격.
  static const double signatureInset = 12;
  static const double signatureWidth = 96;

  @override
  State<SignedPhoto> createState() => _SignedPhotoState();
}

class _SignedPhotoState extends State<SignedPhoto> {
  ImageStream? _stream;
  ImageStreamListener? _listener;
  Size? _photoSize;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolve();
  }

  @override
  void didUpdateWidget(SignedPhoto oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.photoUrl != widget.photoUrl ||
        oldWidget.photoProvider != widget.photoProvider) {
      _photoSize = null;
      _resolve();
    }
  }

  void _resolve() {
    final provider = widget.photoProvider ?? NetworkImage(widget.photoUrl);
    final stream = provider.resolve(createLocalImageConfiguration(context));
    if (stream.key == _stream?.key) return;
    _release();
    _stream = stream;
    _listener = ImageStreamListener(
      (info, _) {
        final size = Size(
          info.image.width.toDouble(),
          info.image.height.toDouble(),
        );
        if (mounted && size != _photoSize) setState(() => _photoSize = size);
      },
      onError: (_, _) {
        if (mounted && _photoSize != null) setState(() => _photoSize = null);
      },
    );
    stream.addListener(_listener!);
  }

  void _release() {
    final listener = _listener;
    if (listener != null) _stream?.removeListener(listener);
    _stream = null;
    _listener = null;
  }

  @override
  void dispose() {
    _release();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final signatureUrl = widget.signatureUrl;
    return LayoutBuilder(
      builder: (context, constraints) {
        final area = constraints.biggest;
        final photo = _photoSize;
        var rect = Offset.zero & area;
        if (photo != null && !photo.isEmpty && !area.isEmpty) {
          final fitted = applyBoxFit(BoxFit.contain, photo, area).destination;
          rect = Alignment.center.inscribe(fitted, Offset.zero & area);
        }
        return Stack(
          fit: StackFit.expand,
          children: [
            AppNetworkImage(
              url: widget.photoUrl,
              fit: BoxFit.contain,
              semanticLabel: widget.semanticLabel,
            ),
            if (signatureUrl != null)
              Positioned(
                right: area.width - rect.right + SignedPhoto.signatureInset,
                bottom: area.height - rect.bottom + SignedPhoto.signatureInset,
                width: SignedPhoto.signatureWidth,
                child: TestId(
                  FeedTestIds.signatureImage,
                  child: AppNetworkImage(
                    url: signatureUrl,
                    fit: BoxFit.contain,
                    omitOnError: true,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
