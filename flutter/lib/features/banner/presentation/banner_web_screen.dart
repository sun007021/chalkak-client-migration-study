import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/test_id.dart';
import '../domain/banner_web_view_model.dart';
import 'banner_test_ids.dart';
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
  void initState() {
    super.initState();
    widget.viewModel.start();
  }

  @override
  Widget build(BuildContext context) {
    return TestId(
      BannerTestIds.issueRoot,
      child: Scaffold(
        appBar: AppBar(
          leading: TestId.button(
            BannerTestIds.issueBackButton,
            child: IconButton(
              icon: const Icon(Icons.arrow_back),
              tooltip: MaterialLocalizations.of(context).backButtonTooltip,
              onPressed: widget.onBack,
            ),
          ),
          title: const TestId(
            BannerTestIds.issueTitle,
            child: Text(Copy.homeBannerTitle),
          ),
        ),
        body: SafeArea(
          child: ListenableBuilder(
            listenable: widget.viewModel,
            builder: (context, _) => _body(context),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    final viewModel = widget.viewModel;
    final state = viewModel.state;
    if (state.status == BannerWebStatus.unsafeUrl) {
      return const Center(
        child: TestId(
          BannerTestIds.issueLinkOpenFailedMessage,
          child: Text(Copy.bannerWebLinkUnavailable),
        ),
      );
    }
    // 웹뷰는 로딩·오류 표시 아래에 계속 두어 다시 시도가 같은 웹뷰를 다시 로드하게 한다.
    return Stack(
      children: [
        Positioned.fill(
          child: widget.webViewBuilder.build(
            context,
            BannerWebViewHost(
              initialUrl: viewModel.url,
              reloadToken: state.reloadToken,
              onNavigationRequest: viewModel.onNavigationRequest,
              onLoadFinished: viewModel.onLoadFinished,
              onLoadFailed: viewModel.onLoadFailed,
            ),
          ),
        ),
        if (state.status == BannerWebStatus.loading)
          const Positioned.fill(
            child: Center(
              child: TestId(
                BannerTestIds.issueLoading,
                child: CircularProgressIndicator(),
              ),
            ),
          ),
        if (state.status == BannerWebStatus.loadError)
          Positioned.fill(child: _LoadError(onRetry: viewModel.retry)),
      ],
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Theme.of(context).colorScheme.surface,
      child: Center(
        child: TestId(
          BannerTestIds.issueErrorState,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(Copy.bannerWebLoadError),
              const SizedBox(height: 12),
              TestId.button(
                BannerTestIds.issueRetryButton,
                child: OutlinedButton(
                  onPressed: onRetry,
                  child: const Text(Copy.bannerWebRetry),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
