import 'package:flutter/material.dart';

/// 네트워크 이미지. 받는 동안과 실패했을 때 항목 자리에 대체 배경을 그려 레이아웃과
/// 위젯 트리가 깨지지 않게 한다. [url]이 null이어도 같은 대체 배경이다.
class AppNetworkImage extends StatelessWidget {
  const AppNetworkImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.semanticLabel,
  });

  final String? url;
  final BoxFit fit;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final url = this.url;
    if (url == null) return const _ImagePlaceholder();
    return Image.network(
      url,
      fit: fit,
      semanticLabel: semanticLabel,
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : const _ImagePlaceholder(),
      errorBuilder: (context, error, stackTrace) =>
          const _ImagePlaceholder(broken: true),
    );
  }
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder({this.broken = false});

  final bool broken;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return ColoredBox(
      color: colors.surfaceContainerHighest,
      child: Center(
        child: broken
            ? Icon(Icons.image_not_supported_outlined, color: colors.outline)
            : null,
      ),
    );
  }
}
