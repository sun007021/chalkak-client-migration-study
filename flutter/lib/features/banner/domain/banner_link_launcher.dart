enum BannerLaunchResult { opened, noBrowser, failed }

/// 시스템 브라우저로 링크를 연다. 플랫폼 구현은 `url_launcher` 등으로 만든다.
abstract interface class BannerLinkLauncher {
  Future<BannerLaunchResult> open(Uri url);
}
