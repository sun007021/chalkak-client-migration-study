import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/onboarding/domain/legal_document.dart';
import 'package:chalkak/features/onboarding/domain/sign_up_context.dart';
import 'package:chalkak/features/onboarding/presentation/legal_document_view_model.dart';
import 'package:chalkak/features/onboarding/presentation/onboarding_test_ids.dart';
import 'package:chalkak/features/onboarding/presentation/terms_screen.dart';
import 'package:chalkak/features/onboarding/presentation/terms_view_model.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_analytics_tracker.dart';
import '../../../support/onboarding_fakes.dart';

class _Screen {
  _Screen(this.vm, this.analytics, this.events, this.launcher, this.webLoads);
  final TermsViewModel vm;
  final FakeAnalyticsTracker analytics;
  final List<TermsEvent> events;
  final FakeExternalLinkLauncher launcher;
  final List<Uri> webLoads;
}

Future<_Screen> _open(WidgetTester tester) async {
  final analytics = FakeAnalyticsTracker();
  final launcher = FakeExternalLinkLauncher();
  final webLoads = <Uri>[];
  final context = SignUpContext()..begin(kakaoCredentials);
  final vm = TermsViewModel(context: context, analytics: analytics);
  addTearDown(vm.dispose);
  final events = <TermsEvent>[];
  await pumpScreen(
    tester,
    TermsScreen(
      viewModel: vm,
      documentViewModelFactory: (doc) => LegalDocumentViewModel(
        document: doc,
        launcher: launcher,
        analytics: analytics,
      ),
      webViewBuilder:
          (
            context, {
            required url,
            required reloadCount,
            required onLoaded,
            required onError,
          }) {
            webLoads.add(url);
            return const SizedBox.expand();
          },
      onEvent: events.add,
    ),
  );
  return _Screen(vm, analytics, events, launcher, webLoads);
}

void main() {
  widgetTest('TC-ONB-001 제목, 전체 동의, 필수 두 항목과 각 보기, 다음이 보인다', (tester) async {
    await _open(tester);
    expect(byId(OnboardingTestIds.termsRoot), findsOneWidget);
    expect(
      find.descendant(
        of: byId(OnboardingTestIds.termsTitle),
        matching: find.textContaining('찰칵에'),
      ),
      findsOneWidget,
    );
    expect(find.text(Copy.onbTermsAgreeAll), findsOneWidget);
    expect(find.text(Copy.onbTermsService), findsOneWidget);
    expect(find.text(Copy.onbTermsPrivacy), findsOneWidget);
    expect(find.text(Copy.onbTermsView), findsNWidgets(2));
    expect(find.text(Copy.onbTermsNext), findsOneWidget);
    for (final id in [
      OnboardingTestIds.termsAgreeAllCheckbox,
      OnboardingTestIds.termsServiceCheckbox,
      OnboardingTestIds.termsPrivacyCheckbox,
      OnboardingTestIds.termsServiceViewButton,
      OnboardingTestIds.termsPrivacyViewButton,
      OnboardingTestIds.termsNextButton,
      OnboardingTestIds.termsBackButton,
    ]) {
      expect(byId(id), findsOneWidget, reason: id);
    }
  });

  widgetTest('TC-ONB-001 testID가 Semantics identifier로도 노출된다', (tester) async {
    final handle = tester.ensureSemantics();
    await _open(tester);
    for (final id in [
      OnboardingTestIds.termsRoot,
      OnboardingTestIds.termsAgreeAllCheckbox,
      OnboardingTestIds.termsServiceCheckbox,
      OnboardingTestIds.termsPrivacyCheckbox,
      OnboardingTestIds.termsNextButton,
    ]) {
      expect(find.bySemanticsIdentifier(id), findsOneWidget, reason: id);
    }
    handle.dispose();
  });

  widgetTest('TC-ONB-002 처음에는 체크가 모두 꺼져 있고 다음은 비활성이다', (tester) async {
    await _open(tester);
    expect(isChecked(tester, OnboardingTestIds.termsAgreeAllCheckbox), isFalse);
    expect(isChecked(tester, OnboardingTestIds.termsServiceCheckbox), isFalse);
    expect(isChecked(tester, OnboardingTestIds.termsPrivacyCheckbox), isFalse);
    expect(isEnabled(tester, OnboardingTestIds.termsNextButton), isFalse);
  });

  widgetTest('TC-ONB-005 하나만 선택하면 전체 동의는 꺼져 있고 다음은 비활성이다', (tester) async {
    await _open(tester);
    await tester.tap(byId(OnboardingTestIds.termsServiceCheckbox));
    await settleUi(tester, frames: 3);
    expect(isChecked(tester, OnboardingTestIds.termsServiceCheckbox), isTrue);
    expect(isChecked(tester, OnboardingTestIds.termsAgreeAllCheckbox), isFalse);
    expect(isEnabled(tester, OnboardingTestIds.termsNextButton), isFalse);
  });

  widgetTest('TC-ONB-006 전체 동의를 탭하면 모두 켜지고 다음이 활성이며 누르면 이벤트를 낸다', (
    tester,
  ) async {
    final s = await _open(tester);
    await tester.tap(byId(OnboardingTestIds.termsAgreeAllCheckbox));
    await settleUi(tester, frames: 3);
    expect(isChecked(tester, OnboardingTestIds.termsServiceCheckbox), isTrue);
    expect(isChecked(tester, OnboardingTestIds.termsPrivacyCheckbox), isTrue);
    expect(isEnabled(tester, OnboardingTestIds.termsNextButton), isTrue);
    await tester.tap(byId(OnboardingTestIds.termsNextButton));
    await settleUi(tester, frames: 3);
    expect(s.events.whereType<NavigateToSignature>(), hasLength(1));
  });

  widgetTest('TC-ONB-008 TC-ONB-014 보기를 누르면 해당 문서 시트가 열리고 닫아도 체크가 유지된다', (
    tester,
  ) async {
    final s = await _open(tester);
    await tester.tap(byId(OnboardingTestIds.termsAgreeAllCheckbox));
    await settleUi(tester, frames: 3);
    await tester.tap(byId(OnboardingTestIds.termsServiceViewButton));
    await settleUi(tester, frames: 30);
    expect(byId(OnboardingTestIds.legalDocSheet), findsOneWidget);
    expect(s.webLoads.single.toString(), LegalDocument.service.url);
    await tester.tap(byId(OnboardingTestIds.legalDocCloseButton));
    await settleUi(tester, frames: 30);
    expect(byId(OnboardingTestIds.legalDocSheet), findsNothing);
    expect(isChecked(tester, OnboardingTestIds.termsServiceCheckbox), isTrue);
    expect(isChecked(tester, OnboardingTestIds.termsPrivacyCheckbox), isTrue);
  });

  widgetTest('TC-ONB-008 개인정보 처리방침 보기는 개인정보 URL을 연다', (tester) async {
    final s = await _open(tester);
    await tester.tap(byId(OnboardingTestIds.termsPrivacyViewButton));
    await settleUi(tester, frames: 30);
    expect(s.webLoads.single.toString(), LegalDocument.privacy.url);
  });

  widgetTest('TC-ONB-017 뒤로 버튼은 로그인으로 돌아가는 이벤트를 낸다', (tester) async {
    final s = await _open(tester);
    await tester.tap(byId(OnboardingTestIds.termsBackButton));
    await settleUi(tester, frames: 3);
    expect(s.events.whereType<ReturnToLogin>(), hasLength(1));
  });

  widgetTest('TC-ONB-049 화면이 보이면 screen_view(terms)를 한 번 보낸다', (tester) async {
    final s = await _open(tester);
    expect(s.analytics.screenNames, ['terms']);
  });
}
