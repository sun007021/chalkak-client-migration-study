// ignore_for_file: unused_field
import 'package:flutter/widgets.dart';

import '../domain/banner_web_view_model.dart';
import 'banner_web_view_builder.dart';

/// 배너 웹뷰 화면. 제목은 항상 Copy.homeBannerTitle("ISSUE").
/// 상태별로 `issue.loading` / `issue.web-content` / `issue.error-state`+`issue.retry-button` /
/// `issue.link-open-failed-message`를 해당 상태일 때만 트리에 둔다.
/// 뒤로 버튼 `issue.back-button`은 [onBack]을 부른다.
class BannerWebScreen extends StatefulWidget {
  const BannerWebScreen({
    super.key,
    required this.viewModel,
    required this.webViewBuilder,
    required this.onBack,
  });

  final BannerWebViewModel viewModel;
  final BannerWebViewBuilder webViewBuilder;
  final VoidCallback onBack;

  @override
  State<BannerWebScreen> createState() => _BannerWebScreenState();
}

class _BannerWebScreenState extends State<BannerWebScreen> {
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
