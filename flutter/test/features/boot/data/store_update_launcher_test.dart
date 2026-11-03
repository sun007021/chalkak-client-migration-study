import 'package:chalkak/features/boot/data/store_update_launcher.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/onboarding_fakes.dart';

void main() {
  test('TC-BOOT-029 Android는 market:// 주소를 먼저 연다', () async {
    final links = FakeExternalLinkLauncher();
    final ok = await StoreUpdateLauncher.android(
      links: links,
      applicationId: 'com.stonefive.chalkak',
    ).launch();
    expect(ok, isTrue);
    expect(links.opened.map((u) => u.toString()), [
      'market://details?id=com.stonefive.chalkak',
    ]);
  });

  test('TC-BOOT-031 market:// 실패 시 Play 웹 주소로 대체한다', () async {
    final links = FakeExternalLinkLauncher()..results = [false, true];
    final ok = await StoreUpdateLauncher.android(
      links: links,
      applicationId: 'com.stonefive.chalkak',
    ).launch();
    expect(ok, isTrue);
    expect(
      links.opened.last.toString(),
      startsWith('https://play.google.com/'),
    );
  });

  test('TC-BOOT-031 둘 다 열지 못하면 false', () async {
    final links = FakeExternalLinkLauncher()..results = [false, false];
    final ok = await StoreUpdateLauncher.android(
      links: links,
      applicationId: 'com.stonefive.chalkak',
    ).launch();
    expect(ok, isFalse);
    expect(links.opened, hasLength(2));
  });

  test('TC-BOOT-029 iOS는 App Store 앱 페이지를 연다', () async {
    final links = FakeExternalLinkLauncher();
    final ok = await StoreUpdateLauncher.ios(
      links: links,
      appStoreId: '123456',
    ).launch();
    expect(ok, isTrue);
    expect(
      links.opened.single.toString(),
      contains('apps.apple.com/app/id123456'),
    );
  });
}
