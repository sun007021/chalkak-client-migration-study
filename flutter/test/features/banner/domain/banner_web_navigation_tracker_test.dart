import 'package:chalkak/features/banner/domain/banner_web_navigation_tracker.dart';
import 'package:chalkak/features/banner/domain/banner_web_policy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final start = Uri.parse('https://web.example.test/issues/1');
  final redirected = Uri.parse('https://web.example.test/issues/1/final');

  NavigationDecision decide(BannerWebNavigationTracker t, String url) =>
      BannerWebNavigationPolicy.decide(
        t.requestFor(Uri.parse(url), isMainFrame: true),
      );

  test('TC-BANR-017 TC-BANR-018 로드가 끝나기 전 리다이렉트는 최초 로드로 본다', () {
    final t = BannerWebNavigationTracker(start);
    expect(decide(t, start.toString()), NavigationDecision.allowInApp);
    t.onPageStarted(start);
    expect(decide(t, redirected.toString()), NavigationDecision.allowInApp);
    expect(t.isInitialPhase, isTrue);
  });

  test('TC-BANR-018 로드가 끝난 뒤 http 자동 이동은 최초 로드가 아니라 차단 대상이다', () {
    final t = BannerWebNavigationTracker(start)..onPageFinished(start);
    expect(t.isInitialPhase, isFalse);
    final request = t.requestFor(
      Uri.parse('https://other.example.test/'),
      isMainFrame: true,
    );
    expect(request.isInitialLoad, isFalse);
    expect(request.isUserInitiated, isTrue);
  });

  test('TC-BANR-019 로드 뒤 사용자가 누른 링크는 외부로 연다', () {
    final t = BannerWebNavigationTracker(start)..onPageFinished(start);
    expect(
      decide(t, 'https://web.example.test/issues/2'),
      NavigationDecision.openExternal,
    );
  });

  test('TC-BANR-020 앵커 판정은 리다이렉트로 바뀐 실제 현재 주소를 쓴다', () {
    final t = BannerWebNavigationTracker(start)
      ..onUrlChange(redirected)
      ..onPageFinished(redirected);
    expect(t.currentUrl, redirected);
    expect(
      decide(t, '${redirected.toString()}#section'),
      NavigationDecision.allowInApp,
    );
    // 처음 주소 기준이었다면 다른 문서로 보여 외부로 열렸을 주소다.
    expect(
      decide(t, '${start.toString()}#section'),
      NavigationDecision.openExternal,
    );
  });

  test('TC-BANR-018 하위 프레임 이동은 최초 로드 구간에도 사용자 이동으로 보지 않는다', () {
    final t = BannerWebNavigationTracker(start);
    final request = t.requestFor(
      Uri.parse('http://ads.example.test/frame'),
      isMainFrame: false,
    );
    expect(request.isInitialLoad, isFalse);
    expect(
      BannerWebNavigationPolicy.decide(request),
      NavigationDecision.allowInApp,
    );
  });

  test('TC-BANR-017 다시 시도하면 처음 주소를 새로 최초 로드한다', () {
    final t = BannerWebNavigationTracker(start)
      ..onUrlChange(redirected)
      ..onLoadFailed();
    expect(t.isInitialPhase, isFalse);
    t.restart();
    expect(t.isInitialPhase, isTrue);
    expect(t.currentUrl, start);
  });
}
