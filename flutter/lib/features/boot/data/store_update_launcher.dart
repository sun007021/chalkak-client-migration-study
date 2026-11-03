import 'package:flutter/services.dart';

import '../../onboarding/domain/legal_document.dart';
import '../domain/update_checker.dart';

/// 후보 스토어 주소를 앞에서부터 하나씩 열어 본다. 하나라도 열리면 true, 모두 실패하면 false.
/// 열기는 [ExternalLinkLauncher](url_launcher)에 맡겨 플랫폼 분기를 이 클래스 밖에 둔다.
class StoreUpdateLauncher implements UpdateLauncher {
  const StoreUpdateLauncher({required this.links, required this.candidates});

  /// Android. `market://`을 먼저, 안 되면 Play 웹 주소.
  factory StoreUpdateLauncher.android({
    required ExternalLinkLauncher links,
    required String applicationId,
  }) => StoreUpdateLauncher(
    links: links,
    candidates: [
      Uri.parse('market://details?id=$applicationId'),
      Uri.parse('https://play.google.com/store/apps/details?id=$applicationId'),
    ],
  );

  /// iOS. App Store 앱 페이지. [appStoreId]가 비면 열 곳이 없다(false).
  factory StoreUpdateLauncher.ios({
    required ExternalLinkLauncher links,
    required String appStoreId,
  }) => StoreUpdateLauncher(
    links: links,
    candidates: appStoreId.isEmpty
        ? const []
        : [
            Uri.parse('itms-apps://apps.apple.com/app/id$appStoreId'),
            Uri.parse('https://apps.apple.com/app/id$appStoreId'),
          ],
  );

  final ExternalLinkLauncher links;
  final List<Uri> candidates;

  @override
  Future<bool> launch() async {
    for (final uri in candidates) {
      try {
        if (await links.open(uri)) return true;
      } on Object {
        // 다음 후보로 넘어간다.
      }
    }
    return false;
  }
}

/// [SystemNavigator.pop]으로 앱을 종료한다(Android).
class SystemNavigatorAppExit implements AppExit {
  const SystemNavigatorAppExit();

  @override
  Future<void> exit() => SystemNavigator.pop();
}

/// 종료하지 않는 자리(iOS 등). 게이트가 호출하지 않지만 의존성을 채운다.
class NoopAppExit implements AppExit {
  const NoopAppExit();

  @override
  Future<void> exit() async {}
}
