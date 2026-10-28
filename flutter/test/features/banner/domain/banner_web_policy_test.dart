import 'package:chalkak/features/banner/domain/banner_web_policy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final page = Uri.parse('https://web.example.test/issues/1');

  NavigationDecision decide(
    String url, {
    bool main = true,
    bool gesture = false,
    bool newWindow = false,
    bool initial = false,
    Uri? current,
  }) => BannerWebNavigationPolicy.decide(
    WebNavigationRequest(
      url: Uri.parse(url),
      isMainFrame: main,
      isUserInitiated: gesture,
      isNewWindow: newWindow,
      isInitialLoad: initial,
      currentUrl: current,
    ),
  );

  test('TC-BANR-017 최초 로드는 https+호스트만 앱 안 허용, 나머지는 차단', () {
    expect(
      decide('https://web.example.test/issues/1', initial: true),
      NavigationDecision.allowInApp,
    );
    expect(
      decide('http://web.example.test/issues/1', initial: true),
      NavigationDecision.block,
    );
    expect(decide('', initial: true), NavigationDecision.block);
    expect(decide('https:///path', initial: true), NavigationDecision.block);
    expect(decide('web.example.test', initial: true), NavigationDecision.block);
  });

  test('TC-BANR-017 isLoadable은 https이고 호스트가 있을 때만 true', () {
    expect(
      BannerWebNavigationPolicy.isLoadable(Uri.parse('https://a.test/x')),
      isTrue,
    );
    expect(
      BannerWebNavigationPolicy.isLoadable(Uri.parse('http://a.test/x')),
      isFalse,
    );
    expect(BannerWebNavigationPolicy.isLoadable(Uri.parse('')), isFalse);
    expect(
      BannerWebNavigationPolicy.isLoadable(Uri.parse('https:///x')),
      isFalse,
    );
    expect(
      BannerWebNavigationPolicy.isLoadable(Uri.parse('javascript:alert(1)')),
      isFalse,
    );
  });

  test('TC-BANR-018 사용자 제스처 없는 자동 이동과 새 창 열기는 차단', () {
    expect(
      decide('https://other.test/redirect', current: page),
      NavigationDecision.block,
    );
    expect(
      decide('https://web.example.test/issues/1', current: page),
      NavigationDecision.block,
    );
    expect(
      decide('https://other.test/popup', newWindow: true, current: page),
      NavigationDecision.block,
    );
  });

  test('TC-BANR-019 사용자가 누른 http(s) 링크는 같은 호스트·같은 URL이어도 외부 브라우저', () {
    expect(
      decide('https://other.test/a', gesture: true, current: page),
      NavigationDecision.openExternal,
    );
    expect(
      decide('http://other.test/a', gesture: true, current: page),
      NavigationDecision.openExternal,
    );
    expect(
      decide('https://web.example.test/issues/2', gesture: true, current: page),
      NavigationDecision.openExternal,
    );
    expect(
      decide('https://web.example.test/issues/1', gesture: true, current: page),
      NavigationDecision.openExternal,
    );
    expect(
      decide(
        'https://other.test/a',
        gesture: true,
        newWindow: true,
        current: page,
      ),
      NavigationDecision.openExternal,
    );
  });

  test('TC-BANR-020 같은 문서 앵커는 앱 안, 새 탭 앵커는 외부', () {
    expect(
      decide(
        'https://web.example.test/issues/1#section',
        gesture: true,
        current: page,
      ),
      NavigationDecision.allowInApp,
    );
    expect(
      decide(
        'https://web.example.test/issues/1#section',
        gesture: true,
        newWindow: true,
        current: page,
      ),
      NavigationDecision.openExternal,
    );
  });

  test('TC-BANR-021 http(s)가 아닌 스킴은 모두 차단', () {
    for (final url in [
      'tel:01012345678',
      'mailto:a@b.test',
      'intent://scan/#Intent;scheme=zxing;end',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'chalkak://open',
      'kakaotalk://inbox',
    ]) {
      expect(
        decide(url, gesture: true, current: page),
        NavigationDecision.block,
        reason: url,
      );
      expect(
        decide(url, current: page),
        NavigationDecision.block,
        reason: '제스처 없음 $url',
      );
    }
  });

  test('TC-BANR-022 하위 프레임 이동은 앱 밖으로 열지 않고 프레임 안에서 처리', () {
    expect(
      decide('https://ads.example.test/frame', main: false, current: page),
      NavigationDecision.allowInApp,
    );
    expect(
      decide(
        'https://ads.example.test/frame',
        main: false,
        gesture: true,
        current: page,
      ),
      NavigationDecision.allowInApp,
    );
  });
}
