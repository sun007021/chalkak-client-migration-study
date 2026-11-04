import 'package:flutter/material.dart';

import '../design/chalkak_tokens.dart';
import 'components/chalkak_skeleton.dart';

/// 네트워크 이미지. 받는 동안과 실패했을 때 항목 자리에 대체 배경을 그려 레이아웃과
/// 위젯 트리가 깨지지 않게 한다. [url]이 null이어도 같은 대체 배경이다(TC-FEED-014).
/// [omitOnError]가 true면 실패했을 때 사인처럼 없어도 되는 이미지로 보고 아무것도 그리지 않는다.
class AppNetworkImage extends StatelessWidget {
  const AppNetworkImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.semanticLabel,
    this.omitOnError = false,
  });

  final String? url;
  final BoxFit fit;
  final String? semanticLabel;
  final bool omitOnError;

  @override
  Widget build(BuildContext context) {
    final url = this.url;
    if (url == null) return const _ImagePlaceholder();
    return Image.network(
      url,
      fit: fit,
      semanticLabel: semanticLabel,
      loadingBuilder: omitOnError
          ? null
          : (context, child, progress) => progress == null
                ? child
                : const _ImagePlaceholder(loading: true),
      excludeFromSemantics: semanticLabel == null,
      errorBuilder: (context, error, stackTrace) => omitOnError
          ? const SizedBox.shrink()
          : const _ImagePlaceholder(broken: true),
    );
  }
}

/// 이미지 자리(screens-a §1.8 RemoteImage). 받는 동안은 스켈레톤(쉬머), URL이 없으면 inputBackground 위
/// 사진 아이콘, 실패하면 같은 바탕에 경고 아이콘(24, iconSecondary)이다.
class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder({this.broken = false, this.loading = false});

  final bool broken;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    if (loading) return const ChalkakSkeleton();
    final colors = context.tokens.colors;
    return ColoredBox(
      color: colors.inputBackground,
      child: Center(
        child: Icon(
          broken ? Icons.image_not_supported_outlined : Icons.photo_outlined,
          size: 24,
          color: colors.iconSecondary,
        ),
      ),
    );
  }
}
