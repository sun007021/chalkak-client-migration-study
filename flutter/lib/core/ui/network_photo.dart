import 'package:flutter/material.dart';

/// 네트워크 이미지. 불러오지 못해도 화면이 깨지지 않도록 항상 대체 표시를 둔다(TC-FEED-014).
/// - 기본: 같은 크기의 자리표시자(그림 아이콘).
/// - [omitOnError]: 사인처럼 없어도 되는 이미지는 아무것도 그리지 않는다.
class NetworkPhoto extends StatelessWidget {
  const NetworkPhoto(
    this.url, {
    super.key,
    this.fit = BoxFit.cover,
    this.semanticLabel,
    this.omitOnError = false,
  });

  final String url;
  final BoxFit fit;
  final String? semanticLabel;
  final bool omitOnError;

  @override
  Widget build(BuildContext context) {
    return Image.network(
      url,
      fit: fit,
      semanticLabel: semanticLabel,
      excludeFromSemantics: semanticLabel == null,
      errorBuilder: (context, error, stackTrace) =>
          omitOnError ? const SizedBox.shrink() : const _PhotoPlaceholder(),
    );
  }
}

class _PhotoPlaceholder extends StatelessWidget {
  const _PhotoPlaceholder();

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return ColoredBox(
      color: colors.surfaceContainerHighest,
      child: Center(
        child: Icon(Icons.image_outlined, color: colors.onSurfaceVariant),
      ),
    );
  }
}
