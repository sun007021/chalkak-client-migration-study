import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/onboarding/domain/legal_document.dart';
import 'package:chalkak/features/onboarding/presentation/legal_document_sheet.dart';
import 'package:chalkak/features/onboarding/presentation/legal_document_view_model.dart';
import 'package:chalkak/features/onboarding/presentation/onboarding_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_analytics_tracker.dart';
import '../../../support/onboarding_fakes.dart';

class _Web {
  VoidCallback? onLoaded;
  VoidCallback? onError;
  int reloads = 0;
  int builds = 0;
}

Future<(LegalDocumentViewModel, FakeExternalLinkLauncher, _Web)> _open(
  WidgetTester tester, {
  String? url,
  LegalDocument doc = LegalDocument.service,
}) async {
  final launcher = FakeExternalLinkLauncher();
  final web = _Web();
  final vm = LegalDocumentViewModel(
    document: doc,
    url: url,
    launcher: launcher,
    analytics: FakeAnalyticsTracker(),
  );
  await vm.start();
  await pumpScreen(
    tester,
    Scaffold(
      body: LegalDocumentSheet(
        viewModel: vm,
        webViewBuilder:
            (
              context, {
              required url,
              required reloadCount,
              required onLoaded,
              required onError,
            }) {
              web
                ..onLoaded = onLoaded
                ..onError = onError
                ..reloads = reloadCount;
              web.builds++;
              return const SizedBox.expand();
            },
      ),
    ),
  );
  return (vm, launcher, web);
}

void main() {
  widgetTest('TC-ONB-008 시트는 문서 제목, 닫기 버튼, 웹뷰, 로딩 표시를 보인다', (tester) async {
    await _open(tester, doc: LegalDocument.privacy);
    expect(byId(OnboardingTestIds.legalDocSheet), findsOneWidget);
    expect(
      find.descendant(
        of: byId(OnboardingTestIds.legalDocTitle),
        matching: find.text(Copy.onbTermsDocTitlePrivacy),
      ),
      findsOneWidget,
    );
    expect(byId(OnboardingTestIds.legalDocCloseButton), findsOneWidget);
    expect(byId(OnboardingTestIds.legalDocWebContent), findsOneWidget);
    expect(byId(OnboardingTestIds.legalDocLoading), findsOneWidget);
    expect(byId(OnboardingTestIds.legalDocErrorState), findsNothing);
  });

  widgetTest('TC-ONB-012 로드 실패면 오류 문구와 다시 시도가 보이고 다시 시도가 재로딩한다', (
    tester,
  ) async {
    final (vm, _, web) = await _open(tester);
    web.onLoaded!();
    await settleUi(tester, frames: 3);
    expect(byId(OnboardingTestIds.legalDocLoading), findsNothing);
    web.onError!();
    await settleUi(tester, frames: 3);
    expect(
      find.descendant(
        of: byId(OnboardingTestIds.legalDocErrorState),
        matching: find.text(Copy.onbTermsDocError),
      ),
      findsOneWidget,
    );
    expect(find.text(Copy.onbTermsDocRetry), findsOneWidget);
    await tester.tap(byId(OnboardingTestIds.legalDocRetryButton));
    await settleUi(tester, frames: 3);
    expect(vm.state.reloadCount, 1);
    expect(web.reloads, 1);
    expect(byId(OnboardingTestIds.legalDocErrorState), findsNothing);
    expect(byId(OnboardingTestIds.legalDocLoading), findsOneWidget);
  });

  widgetTest('TC-ONB-013 열 수 없는 URL이면 "문서를 열 수 없어요"만 보인다', (tester) async {
    await _open(tester, url: 'javascript:alert(1)');
    expect(
      find.descendant(
        of: byId(OnboardingTestIds.legalDocOpenFailedMessage),
        matching: find.text(Copy.onbTermsDocCannotOpen),
      ),
      findsOneWidget,
    );
    expect(byId(OnboardingTestIds.legalDocWebContent), findsNothing);
    expect(byId(OnboardingTestIds.legalDocErrorState), findsNothing);
  });
}
