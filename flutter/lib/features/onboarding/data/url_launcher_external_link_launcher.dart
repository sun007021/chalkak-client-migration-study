import 'package:url_launcher/url_launcher.dart';

import '../domain/legal_document.dart';

/// `url_launcher`로 기본 브라우저를 연다. 열 수 없거나 플랫폼 오류면 false.
class UrlLauncherExternalLinkLauncher implements ExternalLinkLauncher {
  const UrlLauncherExternalLinkLauncher();

  @override
  Future<bool> open(Uri url) async {
    try {
      return await launchUrl(url, mode: LaunchMode.externalApplication);
    } on Object {
      return false;
    }
  }
}
