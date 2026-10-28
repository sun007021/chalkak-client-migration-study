import 'package:flutter/widgets.dart';

import '../../core/network/api_client.dart';
import '../../core/ui/toast/toast_controller.dart';
import '../banner/data/api_banner_repository.dart';
import '../banner/data/url_launcher_banner_link_launcher.dart';
import '../banner/presentation/webview_banner_builder.dart';
import '../home/data/api_home_repository.dart';
import '../home/domain/home_preload.dart';
import 'main_dependencies.dart';

/// 실제 구현(ApiHomeRepository, ApiBannerRepository, 웹뷰·외부 링크 어댑터)으로
/// [MainDependencies]를 조립한다. AI 카드는 AIR PR이 채울 때까지 빈 자리를 둔다.
MainDependencies buildMainDependencies(ApiClient client) {
  final home = ApiHomeRepository(client: client);
  return MainDependencies(
    homeRepository: home,
    todayPostRepository: home,
    bannerRepository: ApiBannerRepository(client: client),
    preloadCache: HomePreloadCache(),
    toast: ToastController(),
    bannerWebViewBuilder: const WebViewBannerBuilder(),
    externalLinks: const UrlLauncherBannerLinkLauncher(),
    aiCardBuilder: (context, postId) => const SizedBox.shrink(),
  );
}
