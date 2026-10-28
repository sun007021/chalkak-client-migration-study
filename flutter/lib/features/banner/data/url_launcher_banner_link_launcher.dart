import 'package:url_launcher/url_launcher.dart';

import '../domain/banner_link_launcher.dart';

/// `url_launcher`로 시스템 브라우저를 여는 [BannerLinkLauncher] 실제 구현.
class UrlLauncherBannerLinkLauncher implements BannerLinkLauncher {
  const UrlLauncherBannerLinkLauncher();

  @override
  Future<BannerLaunchResult> open(Uri url) async {
    try {
      if (!await canLaunchUrl(url)) return BannerLaunchResult.noBrowser;
      final opened = await launchUrl(url, mode: LaunchMode.externalApplication);
      return opened ? BannerLaunchResult.opened : BannerLaunchResult.failed;
    } on Object {
      return BannerLaunchResult.failed;
    }
  }
}
