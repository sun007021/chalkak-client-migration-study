import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/onboarding/presentation/legal_document_sheet.dart';
import 'package:chalkak/features/onboarding/presentation/onboarding_test_ids.dart';
import 'package:chalkak/features/settings/presentation/settings_screen.dart';
import 'package:chalkak/features/settings/presentation/settings_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart'
    show byId, isChecked, isEnabled, widgetTest;
import '../../../support/onboarding_fakes.dart'
    show fakeLegalWebView, meSignaturePath;
import '../../../support/settings_fakes.dart';

const _sigOk = 'signature/users-me-signature__get-success.json';
const _sigError = 'signature/users-me-signature__get-internal-error.json';
const _pushAllTrue = 'settings/notification-settings__get-all-true.json';
const _pushTopicOff = 'settings/notification-settings__get-topic-off.json';
const _pushAiOff = 'settings/notification-settings__get-ai-off.json';
const _pushError = 'settings/notification-settings__get-internal-error.json';
const _patchOk = 'settings/notification-settings__patch-no-content.json';

const _toggles = [
  SettingsTestIds.pushTopicToggle,
  SettingsTestIds.pushModerationToggle,
  SettingsTestIds.pushAiToggle,
];

/// 성공 응답을 걸어 둔다. 바꿀 응답만 테스트가 다시 건다(먼저 건 쪽이 이기므로 직접 건 뒤 부르지 않는다).
void _scriptOk(SettingsRig r) {
  r.h.onGetSignature([_sigOk]);
  r.onGetPush([fx(_pushAllTrue)]);
  r.onPatchPush([fx(_patchOk)]);
}

Future<void> _pump(
  WidgetTester tester,
  SettingsRig r, {
  Future<void> Function()? onOpenFeedback,
  Future<bool> Function()? onChangeSignature,
  LegalWebViewBuilder? webViewBuilder,
  Duration wait = const Duration(seconds: 4),
}) async {
  tester.view.physicalSize = const Size(800, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SettingsScreen(
          viewModel: r.vm,
          documentViewModelFactory: legalFactory(analytics: r.analytics),
          webViewBuilder: webViewBuilder ?? fakeLegalWebView,
          onOpenFeedback: onOpenFeedback ?? () async {},
          onChangeSignature: onChangeSignature ?? () async => false,
          onToast: r.toast.show,
        ),
      ),
    ),
  );
  await _settle(tester, wait);
}

Future<void> _settle(
  WidgetTester tester, [
  Duration total = const Duration(seconds: 4),
]) async {
  for (var i = 0; i < total.inMilliseconds ~/ 250; i++) {
    await tester.pump(const Duration(milliseconds: 250));
  }
}

Finder _text(String id, String text) =>
    find.descendant(of: byId(id), matching: find.text(text));

void main() {
  widgetTest('TC-SET-001 REQ-SET-001 회원 설정 탭은 다섯 섹션과 모든 행을 순서대로 보인다', (
    tester,
  ) async {
    final r = SettingsRig();
    _scriptOk(r);
    await _pump(tester, r);
    for (final id in [
      SettingsTestIds.root,
      SettingsTestIds.signatureCard,
      SettingsTestIds.pushSection,
      ..._toggles,
      SettingsTestIds.logoutRow,
      SettingsTestIds.withdrawRow,
      SettingsTestIds.feedbackRow,
      SettingsTestIds.privacyRow,
      SettingsTestIds.termsRow,
      SettingsTestIds.versionRow,
      SettingsTestIds.versionValue,
      SettingsTestIds.signatureChangeButton,
    ]) {
      expect(byId(id), findsOneWidget, reason: id);
    }
    expect(byId(SettingsTestIds.loginButton), findsNothing);
    final titles = [
      Copy.settingsSectionApp,
      Copy.settingsSectionPush,
      Copy.settingsSectionAccount,
      Copy.settingsSectionFeedback,
      Copy.settingsSectionInfo,
    ];
    final tops = [for (final t in titles) tester.getTopLeft(find.text(t)).dy];
    expect(tops, orderedEquals([...tops]..sort()));
    expect(tops.toSet(), hasLength(5));
    for (final label in [
      Copy.settingsRowLogout,
      Copy.settingsRowWithdraw,
      Copy.settingsRowFeedback,
      Copy.settingsRowPrivacy,
      Copy.settingsRowTerms,
      Copy.settingsRowVersion,
      Copy.signCardTitle,
      Copy.signCardChange,
    ]) {
      expect(find.text(label), findsWidgets, reason: label);
    }
  });

  widgetTest('REQ-SET-002 게스트 설정 탭은 로그인 버튼만 보이고 API를 부르지 않는다', (tester) async {
    final r = SettingsRig(guest: true);
    await _pump(tester, r);
    expect(byId(SettingsTestIds.loginButton), findsOneWidget);
    expect(
      _text(SettingsTestIds.loginButton, Copy.settingsGuestLogin),
      findsOneWidget,
    );
    for (final id in [
      SettingsTestIds.signatureCard,
      SettingsTestIds.pushSection,
      ..._toggles,
      SettingsTestIds.logoutRow,
      SettingsTestIds.withdrawRow,
      SettingsTestIds.feedbackRow,
      SettingsTestIds.privacyRow,
      SettingsTestIds.termsRow,
      SettingsTestIds.versionRow,
    ]) {
      expect(byId(id), findsNothing, reason: id);
    }
    expect(r.h.adapter.requests, isEmpty);
  });

  widgetTest('TC-SET-003 사인 카드는 조회한 사인 이미지를 보이고 로딩 표시는 사라진다', (tester) async {
    final r = SettingsRig();
    _scriptOk(r);
    await _pump(tester, r);
    expect(byId(SettingsTestIds.signatureImage), findsOneWidget);
    expect(byId(SettingsTestIds.signatureLoading), findsNothing);
    expect(byId(SettingsTestIds.signatureError), findsNothing);
    expect(byId(SettingsTestIds.signatureRetryButton), findsNothing);
  });

  widgetTest('TC-SET-003 사인을 불러오는 동안은 로딩이 보인다', (tester) async {
    final r = SettingsRig();
    r.h.adapter.on('GET', meSignaturePath, [
      fx(_sigOk, delay: const Duration(seconds: 2)),
    ]);
    r.onGetPush([fx(_pushAllTrue)]);
    await _pump(tester, r, wait: const Duration(seconds: 1));
    expect(byId(SettingsTestIds.signatureLoading), findsOneWidget);
    expect(byId(SettingsTestIds.signatureImage), findsNothing);
    await _settle(tester, const Duration(seconds: 3));
    expect(byId(SettingsTestIds.signatureLoading), findsNothing);
    expect(byId(SettingsTestIds.signatureImage), findsOneWidget);
  });

  widgetTest('TC-SET-006 최초 사인 조회가 실패하면 오류 문구와 다시 불러오기가 보이고 누르면 재조회한다', (
    tester,
  ) async {
    final r = SettingsRig();
    r.h.adapter.on('GET', meSignaturePath, [...failing(_sigError), fx(_sigOk)]);
    r.onGetPush([fx(_pushAllTrue)]);
    await _pump(tester, r);
    expect(
      _text(SettingsTestIds.signatureError, Copy.signLoadError),
      findsOneWidget,
    );
    expect(byId(SettingsTestIds.signatureImage), findsNothing);
    expect(byId(SettingsTestIds.signatureRetryButton), findsOneWidget);
    await tester.tap(byId(SettingsTestIds.signatureRetryButton));
    await _settle(tester);
    expect(r.signatureGets, 4);
    expect(byId(SettingsTestIds.signatureError), findsNothing);
    expect(byId(SettingsTestIds.signatureImage), findsOneWidget);
  });

  widgetTest('REQ-SET-004 변경하기를 누르면 사인 변경 흐름을 열고 성공하면 사인을 다시 조회한다', (
    tester,
  ) async {
    final r = SettingsRig();
    _scriptOk(r);
    var opened = 0;
    await _pump(
      tester,
      r,
      onChangeSignature: () async {
        opened++;
        return true;
      },
    );
    await tester.tap(byId(SettingsTestIds.signatureChangeButton));
    await _settle(tester);
    expect(opened, 1);
    expect(r.signatureGets, 2);
  });

  widgetTest('TC-SET-016 푸시 설정 조회가 실패하면 토글이 비활성이고 오류 문구와 다시 시도가 보인다', (
    tester,
  ) async {
    final r = SettingsRig();
    r.h.onGetSignature([_sigOk]);
    r.onGetPush([...failing(_pushError), fx(_pushAllTrue)]);
    await _pump(tester, r);
    for (final id in _toggles) {
      expect(isEnabled(tester, id), isFalse, reason: id);
    }
    expect(
      _text(SettingsTestIds.pushError, Copy.settingsPushLoadError),
      findsOneWidget,
    );
    expect(byId(SettingsTestIds.pushLoading), findsNothing);
    await tester.tap(byId(SettingsTestIds.pushRetryButton));
    await _settle(tester);
    expect(r.pushGets, 4);
    expect(byId(SettingsTestIds.pushError), findsNothing);
    expect(byId(SettingsTestIds.pushRetryButton), findsNothing);
    for (final id in _toggles) {
      expect(isEnabled(tester, id), isTrue, reason: id);
    }
  });

  widgetTest('TC-SET-017 푸시 설정을 불러오는 동안 토글은 눌리지 않는 상태다', (tester) async {
    final r = SettingsRig();
    r.h.onGetSignature([_sigOk]);
    r.onGetPush([fx(_pushAllTrue, delay: const Duration(seconds: 2))]);
    await _pump(tester, r, wait: const Duration(seconds: 1));
    expect(byId(SettingsTestIds.pushLoading), findsOneWidget);
    for (final id in _toggles) {
      expect(isEnabled(tester, id), isFalse, reason: id);
    }
    await _settle(tester, const Duration(seconds: 3));
    expect(byId(SettingsTestIds.pushLoading), findsNothing);
    for (final id in _toggles) {
      expect(isEnabled(tester, id), isTrue, reason: id);
    }
  });

  widgetTest('TC-SET-018 토글 세 개의 라벨과 checked 상태가 서버 값과 같다', (tester) async {
    final r = SettingsRig();
    r.h.onGetSignature([_sigOk]);
    r.onGetPush([fx(_pushTopicOff)]);
    await _pump(tester, r);
    expect(find.text(Copy.settingsPushTopic), findsOneWidget);
    expect(find.text(Copy.settingsPushModeration), findsOneWidget);
    expect(find.text(Copy.settingsPushAiReview), findsOneWidget);
    expect(isChecked(tester, SettingsTestIds.pushTopicToggle), isFalse);
    expect(isChecked(tester, SettingsTestIds.pushModerationToggle), isTrue);
    expect(isChecked(tester, SettingsTestIds.pushAiToggle), isTrue);
  });

  widgetTest('TC-SET-018 꺼진 AI 설정은 unchecked로 보인다', (tester) async {
    final r = SettingsRig();
    r.h.onGetSignature([_sigOk]);
    r.onGetPush([fx(_pushAiOff)]);
    await _pump(tester, r);
    expect(isChecked(tester, SettingsTestIds.pushTopicToggle), isTrue);
    expect(isChecked(tester, SettingsTestIds.pushAiToggle), isFalse);
  });

  widgetTest('TC-SET-023 토글을 탭하면 응답 전에 즉시 새 상태로 보이고 그 항목만 PATCH한다', (
    tester,
  ) async {
    final r = SettingsRig();
    r.h.onGetSignature([_sigOk]);
    r.onGetPush([fx(_pushAllTrue)]);
    r.onPatchPush([fx(_patchOk, delay: const Duration(seconds: 2))]);
    await _pump(tester, r);
    await tester.tap(byId(SettingsTestIds.pushModerationToggle));
    await tester.pump(const Duration(milliseconds: 100));
    expect(isChecked(tester, SettingsTestIds.pushModerationToggle), isFalse);
    expect(isChecked(tester, SettingsTestIds.pushTopicToggle), isTrue);
    expect(r.pushPatches, 1);
    expect(
      r.h.adapter.where('PATCH', notificationSettingsPath).single.jsonBody,
      {'moderationPushEnabled': false},
    );
    await _settle(tester, const Duration(seconds: 3));
    expect(isChecked(tester, SettingsTestIds.pushModerationToggle), isFalse);
  });

  widgetTest('TC-SET-039 푸시 알림 섹션에는 서버 토글 3개만 있고 OS 권한 행은 없다', (tester) async {
    final r = SettingsRig();
    _scriptOk(r);
    await _pump(tester, r);
    expect(
      find.descendant(
        of: byId(SettingsTestIds.pushSection),
        matching: find.byType(Switch),
      ),
      findsNWidgets(3),
    );
    expect(r.permission.statusCalls, 0);
    expect(r.permission.openSettingsCalls, 0);
  });

  widgetTest('TC-SET-041 로그아웃 행을 누르면 확인 대화상자가 뜨고 확인·취소가 있다', (tester) async {
    final r = SettingsRig();
    _scriptOk(r);
    await _pump(tester, r);
    expect(byId(SettingsTestIds.logoutDialog), findsNothing);
    await tester.tap(byId(SettingsTestIds.logoutRow));
    await _settle(tester, const Duration(seconds: 1));
    expect(
      _text(SettingsTestIds.logoutDialog, Copy.authLogoutConfirmMessage),
      findsOneWidget,
    );
    expect(
      _text(SettingsTestIds.logoutConfirmButton, Copy.authLogoutConfirmOk),
      findsOneWidget,
    );
    expect(
      _text(SettingsTestIds.logoutCancelButton, Copy.authConfirmCancel),
      findsOneWidget,
    );
    expect(byId(SettingsTestIds.withdrawDialog), findsNothing);
  });

  widgetTest('TC-SET-044 회원탈퇴 행을 누르면 로그아웃과 다른 문구의 확인 대화상자가 뜬다', (tester) async {
    final r = SettingsRig();
    _scriptOk(r);
    await _pump(tester, r);
    await tester.tap(byId(SettingsTestIds.withdrawRow));
    await _settle(tester, const Duration(seconds: 1));
    expect(
      _text(SettingsTestIds.withdrawDialog, Copy.authWithdrawConfirmMessage),
      findsOneWidget,
    );
    expect(
      _text(SettingsTestIds.withdrawConfirmButton, Copy.authWithdrawConfirmOk),
      findsOneWidget,
    );
    expect(
      _text(SettingsTestIds.withdrawCancelButton, Copy.authConfirmCancel),
      findsOneWidget,
    );
    expect(byId(SettingsTestIds.logoutDialog), findsNothing);
    expect(find.text(Copy.authLogoutConfirmMessage), findsNothing);
  });

  widgetTest('TC-SET-041 TC-SET-042 취소하면 대화상자가 닫히고 설정 화면이 유지되며 서버 호출이 없다', (
    tester,
  ) async {
    final r = SettingsRig();
    _scriptOk(r);
    await _pump(tester, r);
    final requests = r.h.adapter.requests.length;
    await tester.tap(byId(SettingsTestIds.logoutRow));
    await _settle(tester, const Duration(seconds: 1));
    await tester.tap(byId(SettingsTestIds.logoutCancelButton));
    await _settle(tester, const Duration(seconds: 1));
    expect(byId(SettingsTestIds.logoutDialog), findsNothing);
    expect(byId(SettingsTestIds.root), findsOneWidget);
    expect(r.auth.logoutTokens, isEmpty);
    expect(r.h.adapter.requests.length, requests);
  });

  widgetTest('TC-SET-045 탈퇴 대화상자에서 취소하면 DELETE가 나가지 않는다', (tester) async {
    final r = SettingsRig();
    _scriptOk(r);
    await _pump(tester, r);
    await tester.tap(byId(SettingsTestIds.withdrawRow));
    await _settle(tester, const Duration(seconds: 1));
    await tester.tap(byId(SettingsTestIds.withdrawCancelButton));
    await _settle(tester, const Duration(seconds: 1));
    expect(byId(SettingsTestIds.withdrawDialog), findsNothing);
    expect(r.auth.deleteCalls, 0);
  });

  widgetTest('REQ-SET-007 탈퇴 처리 중에는 확인 버튼이 비활성이다', (tester) async {
    final r = SettingsRig();
    _scriptOk(r);
    final gate = Completer<void>();
    r.auth.onDelete = () => gate.future;
    await _pump(tester, r);
    await tester.tap(byId(SettingsTestIds.withdrawRow));
    await _settle(tester, const Duration(seconds: 1));
    await tester.tap(byId(SettingsTestIds.withdrawConfirmButton));
    await tester.pump(const Duration(milliseconds: 100));
    expect(isEnabled(tester, SettingsTestIds.withdrawConfirmButton), isFalse);
    expect(r.auth.deleteCalls, 1);
    gate.complete();
    await _settle(tester, const Duration(seconds: 1));
  });

  widgetTest('TC-SET-047 개인정보처리방침·이용약관 행은 각 문서 시트를 열고 screen_view를 한 번씩 보낸다', (
    tester,
  ) async {
    final r = SettingsRig();
    _scriptOk(r);
    await _pump(tester, r);
    await tester.tap(byId(SettingsTestIds.privacyRow));
    await _settle(tester, const Duration(seconds: 1));
    expect(byId(OnboardingTestIds.legalDocSheet), findsOneWidget);
    expect(
      _text(OnboardingTestIds.legalDocTitle, Copy.onbTermsDocTitlePrivacy),
      findsOneWidget,
    );
    await tester.tap(byId(OnboardingTestIds.legalDocCloseButton));
    await _settle(tester, const Duration(seconds: 1));
    await tester.tap(byId(SettingsTestIds.termsRow));
    await _settle(tester, const Duration(seconds: 1));
    expect(
      _text(OnboardingTestIds.legalDocTitle, Copy.onbTermsDocTitleService),
      findsOneWidget,
    );
    expect(r.analytics.screenNames.where((n) => n != 'settings').toList(), [
      'privacy_policy',
      'terms_of_service',
    ]);
  });

  widgetTest('TC-SET-048 문서 로딩이 실패하면 오류 문구와 다시 시도가 보인다', (tester) async {
    final r = SettingsRig();
    _scriptOk(r);
    await _pump(
      tester,
      r,
      webViewBuilder:
          (
            context, {
            required url,
            required reloadCount,
            required onLoaded,
            required onError,
          }) {
            WidgetsBinding.instance.addPostFrameCallback((_) => onError());
            return const SizedBox.expand();
          },
    );
    await tester.tap(byId(SettingsTestIds.termsRow));
    await _settle(tester, const Duration(seconds: 1));
    expect(
      _text(OnboardingTestIds.legalDocErrorState, Copy.onbTermsDocError),
      findsOneWidget,
    );
    expect(byId(OnboardingTestIds.legalDocRetryButton), findsOneWidget);
  });

  widgetTest('TC-SET-049 버전정보 행은 빌드 설정의 앱 버전 문자열을 값으로 보인다', (tester) async {
    final r = SettingsRig(appVersion: '2.3.4');
    _scriptOk(r);
    await _pump(tester, r);
    expect(_text(SettingsTestIds.versionValue, '2.3.4'), findsOneWidget);
  });

  widgetTest('REQ-FDBK-001 피드백 보내기 행을 누르면 피드백 화면을 연다', (tester) async {
    final r = SettingsRig();
    _scriptOk(r);
    var opened = 0;
    await _pump(
      tester,
      r,
      onOpenFeedback: () async {
        opened++;
      },
    );
    await tester.tap(byId(SettingsTestIds.feedbackRow));
    await _settle(tester, const Duration(seconds: 1));
    expect(opened, 1);
    expect(r.toast.messages, isEmpty);
  });
}
