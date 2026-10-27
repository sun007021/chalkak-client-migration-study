import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/banner/domain/banner_web_policy.dart';
import 'package:chalkak/features/banner/domain/banner_web_view_model.dart';
import 'package:chalkak/features/banner/presentation/banner_test_ids.dart';
import 'package:chalkak/features/banner/presentation/banner_web_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart' show byId, widgetTest;
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
  final launcher = FakeBannerLinkLauncher();
  final builder = FakeBannerWebViewBuilder();
  int backs = 0;
  late final BannerWebViewModel vm;

  Widget get widget => MaterialApp(
    home: BannerWebScreen(
      viewModel: vm,
      webViewBuilder: builder,
      onBack: () => backs++,
    ),
  );
}

void main() {
  widgetTest('TC-BANR-012 화면 제목은 항상 ISSUE이고 screen_view issue를 1회 보낸다', (
    tester,
  ) async {
    final r = _Rig();
    await tester.pumpWidget(r.widget);
    await tester.pump();
    expect(byId(BannerTestIds.issueRoot), findsOneWidget);
    expect(
      find.descendant(
        of: byId(BannerTestIds.issueTitle),
        matching: find.text(Copy.homeBannerTitle),
      ),
      findsOneWidget,
    );
    expect(r.analytics.screenNames, ['issue']);
  });

  widgetTest('TC-BANR-024 로딩 중에는 웹 본문과 로딩 표시가 있고 완료되면 로딩이 사라진다', (
    tester,
  ) async {
    final r = _Rig();
    await tester.pumpWidget(r.widget);
    await tester.pump();
    expect(byId(BannerTestIds.issueWebContent), findsOneWidget);
    expect(byId(BannerTestIds.issueLoading), findsOneWidget);
    expect(
      r.builder.host?.initialUrl,
      Uri.parse('https://web.example.test/issues/1'),
    );
    r.builder.host!.onLoadFinished();
    await tester.pump();
    expect(byId(BannerTestIds.issueLoading), findsNothing);
    expect(byId(BannerTestIds.issueErrorState), findsNothing);
  });

  widgetTest('TC-BANR-024 로드 실패는 오류 화면과 다시 시도이고, 다시 시도하면 같은 주소를 다시 로드한다', (
    tester,
  ) async {
    final r = _Rig();
    await tester.pumpWidget(r.widget);
    await tester.pump();
    final token = r.builder.host!.reloadToken;
    r.builder.host!.onLoadFailed();
    await tester.pump();
    expect(
      find.descendant(
        of: byId(BannerTestIds.issueErrorState),
        matching: find.text(Copy.bannerWebLoadError),
      ),
      findsOneWidget,
    );
    expect(find.text(Copy.bannerWebRetry), findsOneWidget);
    await tester.tap(byId(BannerTestIds.issueRetryButton));
    await tester.pump();
    expect(byId(BannerTestIds.issueErrorState), findsNothing);
    expect(r.builder.host!.reloadToken, token + 1);
    expect(
      r.builder.host!.initialUrl,
      Uri.parse('https://web.example.test/issues/1'),
    );
    r.builder.host!.onLoadFinished();
    await tester.pump();
    expect(byId(BannerTestIds.issueErrorState), findsNothing);
  });

  widgetTest('TC-BANR-017 안전하지 않은 주소는 웹뷰를 만들지 않고 "링크를 열 수 없어요"를 보인다', (
    tester,
  ) async {
    final r = _Rig('http://web.example.test/issues/1');
    await tester.pumpWidget(r.widget);
    await tester.pump();
    expect(r.builder.builds, 0);
    expect(byId(BannerTestIds.issueWebContent), findsNothing);
    expect(
      find.descendant(
        of: byId(BannerTestIds.issueLinkOpenFailedMessage),
        matching: find.text(Copy.bannerWebLinkUnavailable),
      ),
      findsOneWidget,
    );
  });

  widgetTest('TC-BANR-019 TC-BANR-023 웹뷰 안 링크 탭은 외부 브라우저로 열고 실패하면 토스트다', (
    tester,
  ) async {
    final r = _Rig();
    await tester.pumpWidget(r.widget);
    await tester.pump();
    final decision = await r.builder.host!.onNavigationRequest(
      WebNavigationRequest(
        url: Uri.parse('https://other.test/a'),
        isUserInitiated: true,
        currentUrl: Uri.parse('https://web.example.test/issues/1'),
      ),
    );
    expect(decision, NavigationDecision.openExternal);
    expect(r.launcher.opened, hasLength(1));
    expect(r.toast.messages, isEmpty);
  });

  widgetTest('TC-BANR-026 뒤로 버튼은 onBack을 부른다', (tester) async {
    final r = _Rig();
    await tester.pumpWidget(r.widget);
    await tester.pump();
    await tester.tap(byId(BannerTestIds.issueBackButton));
    expect(r.backs, 1);
  });
}
