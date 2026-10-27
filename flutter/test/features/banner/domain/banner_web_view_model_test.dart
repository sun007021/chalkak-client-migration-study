import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/banner/domain/banner_web_policy.dart';
import 'package:chalkak/features/banner/domain/banner_web_view_model.dart';
import 'package:chalkak/features/banner/domain/external_link_launcher.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_analytics_tracker.dart';
import '../../../support/home_fakes.dart';

class _Rig {
  _Rig([String url = 'https://web.example.test/issues/1']) {
    vm = BannerWebViewModel(
      url: Uri.parse(url),
      analytics: analytics,
      toast: toast,
      launcher: launcher,
    );
  }
  final analytics = FakeAnalyticsTracker();
  final toast = RecordingToast();
  final launcher = FakeExternalLinkLauncher();
  late final BannerWebViewModel vm;
}

WebNavigationRequest _tap(String url) => WebNavigationRequest(
  url: Uri.parse(url),
  isUserInitiated: true,
  currentUrl: Uri.parse('https://web.example.test/issues/1'),
);

void main() {
  test('TC-BANR-025 start를 여러 번 불러도 screen_view issue는 1회다', () {
    final r = _Rig();
    r.vm.start();
    r.vm.start();
    expect(r.analytics.screenNames, ['issue']);
  });

  test('TC-BANR-012 시작 상태는 loading이고 https 주소는 그대로 로드한다', () {
    final r = _Rig();
    r.vm.start();
    expect(r.vm.state.status, BannerWebStatus.loading);
    expect(r.vm.url, Uri.parse('https://web.example.test/issues/1'));
  });

  test('TC-BANR-017 REQ-BANR-013 https가 아닌 주소는 로드하지 않고 unsafeUrl이다', () {
    for (final url in ['http://web.example.test/x', 'https:///x']) {
      final r = _Rig(url);
      r.vm.start();
      expect(r.vm.state.status, BannerWebStatus.unsafeUrl, reason: url);
    }
  });

  test(
    'TC-BANR-024 로드 완료는 shown, 실패는 loadError, 다시 시도는 loading + reloadToken 증가',
    () {
      final r = _Rig();
      r.vm.start();
      final token = r.vm.state.reloadToken;
      r.vm.onLoadFailed();
      expect(r.vm.state.status, BannerWebStatus.loadError);
      r.vm.retry();
      expect(r.vm.state.status, BannerWebStatus.loading);
      expect(r.vm.state.reloadToken, token + 1);
      expect(
        r.vm.url,
        Uri.parse('https://web.example.test/issues/1'),
        reason: '같은 주소',
      );
      r.vm.onLoadFinished();
      expect(r.vm.state.status, BannerWebStatus.shown);
    },
  );

  test('TC-BANR-019 사용자가 누른 링크는 외부 브라우저로 열고 화면은 그대로 shown이다', () async {
    final r = _Rig();
    r.vm.start();
    r.vm.onLoadFinished();
    final decision = await r.vm.onNavigationRequest(
      _tap('https://other.test/a'),
    );
    expect(decision, NavigationDecision.openExternal);
    expect(r.launcher.opened, [Uri.parse('https://other.test/a')]);
    expect(r.toast.messages, isEmpty);
    expect(r.vm.state.status, BannerWebStatus.shown);
  });

  test('TC-BANR-021 차단된 이동은 외부 브라우저도 토스트도 없다', () async {
    final r = _Rig();
    r.vm.start();
    final decision = await r.vm.onNavigationRequest(_tap('tel:01012345678'));
    expect(decision, NavigationDecision.block);
    expect(r.launcher.opened, isEmpty);
    expect(r.toast.messages, isEmpty);
  });

  test('TC-BANR-023 브라우저가 없으면 해당 토스트', () async {
    final r = _Rig();
    r.launcher.result = ExternalLaunchResult.noBrowser;
    r.vm.start();
    await r.vm.onNavigationRequest(_tap('https://other.test/a'));
    expect(r.toast.messages, [Copy.bannerWebNoBrowser]);
  });

  test('TC-BANR-023 브라우저 열기에 실패하면 해당 토스트', () async {
    final r = _Rig();
    r.launcher.result = ExternalLaunchResult.failed;
    r.vm.start();
    await r.vm.onNavigationRequest(_tap('https://other.test/a'));
    expect(r.toast.messages, [Copy.bannerWebOpenFailed]);
  });
}
