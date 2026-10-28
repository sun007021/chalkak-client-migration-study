import 'dart:async';

import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/onboarding/domain/legal_document.dart';
import 'package:chalkak/features/settings/presentation/push_settings_view_model.dart';
import 'package:chalkak/features/settings/presentation/settings_view_model.dart';
import 'package:chalkak/features/signature/presentation/signature_card_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fixtures.dart';
import '../../../support/net_harness.dart' show advance, sessionAt, settle;
import '../../../support/onboarding_fakes.dart' show meSignaturePath;
import '../../../support/settings_fakes.dart';

const _sigOk = 'signature/users-me-signature__get-success.json';
const _sigNullThumb = 'signature/users-me-signature__get-thumbnail-null.json';
const _sigError = 'signature/users-me-signature__get-internal-error.json';
const _sigUnauthorized = 'signature/users-me-signature__get-unauthorized.json';
const _pushAllTrue = 'settings/notification-settings__get-all-true.json';
const _pushTopicOff = 'settings/notification-settings__get-topic-off.json';
const _pushError = 'settings/notification-settings__get-internal-error.json';
const _pushUnauthorized =
    'settings/notification-settings__get-unauthorized.json';
const _refreshOk = 'auth/refresh__success.json';
const _refreshReauth = 'auth/refresh__reauthentication-required.json';

String _field(String fixture, String key) =>
    (Fixture.load(fixture) as Map)[key]! as String;

String _thumb(String fixture) => _field(fixture, 'signatureThumbnailImageUrl');
String _original(String fixture) =>
    _field(fixture, 'signatureOriginalImageUrl');

void main() {
  group('불러오기', () {
    fakeTest('TC-SET-002 사인과 푸시 설정은 서로 기다리지 않고 동시에 요청한다', (async) {
      final r = SettingsRig();
      r.h.adapter.on('GET', meSignaturePath, [
        fx(_sigOk, delay: const Duration(seconds: 2)),
      ]);
      r.onGetPush([fx(_pushAllTrue)]);
      r.vm.onTabShown();
      settle(async);
      expect(r.signatureGets, 1);
      expect(r.pushGets, 1);
      expect(r.card.status, SignatureCardStatus.loading);
      expect(r.pushState.status, PushSettingsStatus.ready);
      advance(async, const Duration(seconds: 3));
      expect(r.card.status, SignatureCardStatus.content);
    });

    fakeTest('TC-SET-002 사인 조회가 실패해도 푸시 설정은 표시된다', (async) {
      final r = SettingsRig();
      r.h.adapter.on('GET', meSignaturePath, failing(_sigError));
      r.onGetPush([fx(_pushTopicOff)]);
      r.show(async, const Duration(seconds: 3));
      expect(r.card.loadFailed, isTrue);
      expect(r.pushState.status, PushSettingsStatus.ready);
      expect(r.pushState.values, topicOff);
    });

    fakeTest('TC-SET-002 푸시 설정 조회가 실패해도 사인 카드는 표시된다', (async) {
      final r = SettingsRig();
      r.h.onGetSignature([_sigOk]);
      r.onGetPush(failing(_pushError));
      r.show(async, const Duration(seconds: 3));
      expect(r.card.status, SignatureCardStatus.content);
      expect(r.card.imageUrl, _thumb(_sigOk));
      expect(r.pushState.status, PushSettingsStatus.loadFailed);
    });

    fakeTest('TC-SET-004 이미 사인이 보여도 다시 진입하면 재조회해 응답으로 교체한다', (async) {
      final r = SettingsRig();
      r.h.onGetSignature([_sigOk, _sigNullThumb]);
      r.onGetPush([fx(_pushAllTrue)]);
      r.show(async);
      expect(r.card.imageUrl, _thumb(_sigOk));
      r.show(async);
      expect(r.signatureGets, 2);
      expect(r.card.imageUrl, _original(_sigNullThumb));
    });

    fakeTest('TC-SET-004 재조회 중에도 기존 사인을 유지한다', (async) {
      final r = SettingsRig();
      r.h.adapter.on('GET', meSignaturePath, [
        fx(_sigOk),
        fx(_sigNullThumb, delay: const Duration(seconds: 1)),
      ]);
      r.onGetPush([fx(_pushAllTrue)]);
      r.show(async);
      r.vm.onTabShown();
      settle(async);
      expect(r.card.imageUrl, _thumb(_sigOk));
      expect(r.card.status, SignatureCardStatus.loading);
    });

    fakeTest('TC-SET-005 재조회가 실패해도 기존 사인을 유지하고 빈 카드로 바꾸지 않는다', (async) {
      final r = SettingsRig();
      r.h.onGetSignature([_sigOk, _sigError]);
      r.onGetPush([fx(_pushAllTrue)]);
      r.show(async);
      r.show(async, const Duration(seconds: 3));
      expect(r.card.imageUrl, _thumb(_sigOk));
      expect(r.card.loadFailed, isFalse);
      expect(r.card.status, SignatureCardStatus.content);
    });

    fakeTest('TC-SET-006 최초 사인 조회가 실패하면 loadFailed이고 다시 시도하면 재조회한다', (async) {
      final r = SettingsRig();
      r.h.adapter.on('GET', meSignaturePath, [
        ...failing(_sigError),
        fx(_sigOk),
      ]);
      r.onGetPush([fx(_pushAllTrue)]);
      r.show(async, const Duration(seconds: 3));
      expect(r.card.loadFailed, isTrue);
      expect(r.card.imageUrl, isNull);
      expect(r.signatureGets, 3);
      r.signature.load();
      advance(async, Duration.zero);
      expect(r.signatureGets, 4);
      expect(r.card.loadFailed, isFalse);
      expect(r.card.imageUrl, _thumb(_sigOk));
    });

    fakeTest('TC-SET-007 사인 조회가 진행 중일 때 다시 트리거해도 중복 요청이 없다', (async) {
      final r = SettingsRig();
      r.h.adapter.on('GET', meSignaturePath, [
        fx(_sigOk, delay: const Duration(seconds: 1)),
      ]);
      r.onGetPush([fx(_pushAllTrue)]);
      r.vm.onTabShown();
      r.vm.onTabShown();
      settle(async);
      r.vm.onTabShown();
      advance(async, const Duration(seconds: 2));
      expect(r.signatureGets, 1);
      expect(r.pushGets, 1);
    });

    fakeTest('TC-SET-008 게스트는 사인·푸시 설정 API를 한 번도 호출하지 않는다', (async) {
      final r = SettingsRig(guest: true);
      r.show(async, const Duration(seconds: 3));
      r.show(async);
      expect(r.h.adapter.requests, isEmpty);
      expect(r.card.status, SignatureCardStatus.idle);
      expect(r.pushState.status, PushSettingsStatus.idle);
      expect(r.vm.state.isGuest, isTrue);
    });

    fakeTest('TC-SET-012 사인 조회 401은 갱신 뒤 1회 재전송한다', (async) {
      final r = SettingsRig();
      r.h.onGetSignature([_sigUnauthorized, _sigOk]);
      r.h.onRefresh(_refreshOk);
      r.onGetPush([fx(_pushAllTrue)]);
      r.show(async);
      expect(r.signatureGets, 2);
      expect(r.h.adapter.count('POST', AuthHttpHarness.refreshPath), 1);
      expect(r.card.imageUrl, _thumb(_sigOk));
    });

    fakeTest('TC-SET-012 사인 조회가 REAUTH면 세션이 지워지고 오류 토스트는 없다', (async) {
      final r = SettingsRig();
      r.h.onGetSignature([_sigUnauthorized]);
      r.h.onRefresh(_refreshReauth);
      r.onGetPush([fx(_pushAllTrue)]);
      r.show(async);
      expect(r.h.clearedReasons, [SessionClearReason.reauthenticationRequired]);
      expect(r.h.store.current, isNull);
      expect(r.card.toast, isNull);
    });

    fakeTest('TC-SET-034 푸시 설정 조회가 REAUTH면 세션이 지워지고 값을 쓰지 않는다', (async) {
      final r = SettingsRig();
      r.h.onGetSignature([_sigOk]);
      r.onGetPush([fx(_pushUnauthorized)]);
      r.h.onRefresh(_refreshReauth);
      r.show(async);
      expect(r.h.clearedReasons, [SessionClearReason.reauthenticationRequired]);
      expect(r.pushState.values, isNull);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('TC-SET-013 사인 조회는 GET /users/me/signature에 Bearer 헤더로 나간다', (
      async,
    ) {
      final r = SettingsRig();
      r.h.onGetSignature([_sigOk]);
      resolve(async, r.h.signatureRepository.fetchCurrent());
      final request = r.h.adapter.where('GET', meSignaturePath).single;
      expect(request.method, 'GET');
      expect(request.path, '/api/v1/users/me/signature');
      expect(request.header('authorization'), 'Bearer at1');
    });

    fakeTest('TC-SET-051 오프라인이면 사인과 푸시 설정이 각각 오류 상태가 된다', (async) {
      final r = SettingsRig();
      const down = FakeResponse.fault(FakeFault.disconnect);
      r.h.adapter.on('GET', meSignaturePath, [down]);
      r.onGetPush([down]);
      r.show(async, const Duration(seconds: 3));
      expect(r.card.loadFailed, isTrue);
      expect(r.pushState.status, PushSettingsStatus.loadFailed);
    });

    fakeTest('TC-SET-051 오프라인이어도 피드백·약관 진입과 로그아웃은 동작한다', (async) {
      final r = SettingsRig();
      const down = FakeResponse.fault(FakeFault.disconnect);
      r.h.adapter.on('GET', meSignaturePath, [down]);
      r.onGetPush([down]);
      r.auth.onLogout = () => throw ApiError.network();
      r.show(async, const Duration(seconds: 3));
      r.vm.onFeedbackPressed();
      r.vm.onPrivacyPressed();
      r.vm.onTermsPressed();
      advance(async, Duration.zero);
      expect(r.events.map((e) => e.runtimeType), [
        OpenFeedback,
        OpenLegalDocument,
        OpenLegalDocument,
      ]);
      r.vm.onLogoutRowPressed();
      r.vm.onLogoutConfirmed();
      advance(async, Duration.zero);
      expect(r.h.store.current, isNull);
      expect(r.h.clearedReasons, [SessionClearReason.userLogout]);
    });

    fakeTest('TC-SET-052 설정 탭이 보이면 screen_view(settings)를 한 번 보낸다', (async) {
      final r = SettingsRig();
      r.h.onGetSignature([_sigOk]);
      r.onGetPush([fx(_pushAllTrue)]);
      r.show(async);
      expect(r.analytics.screenNames, ['settings']);
    });

    fakeTest('TC-SET-052 게스트도 screen_view(settings)를 한 번 보낸다', (async) {
      final r = SettingsRig(guest: true);
      r.show(async);
      expect(r.analytics.screenNames, ['settings']);
    });
  });

  group('사인 변경 뒤 갱신', () {
    fakeTest('TC-SET-009 변경이 성공하면 그 전에 시작된 오래된 조회 결과는 반영하지 않는다', (async) {
      final r = SettingsRig();
      r.h.adapter.on('GET', meSignaturePath, [
        fx(_sigOk, delay: const Duration(seconds: 2)),
        fx(_sigNullThumb),
      ]);
      r.onGetPush([fx(_pushAllTrue)]);
      r.show(async);
      expect(r.card.status, SignatureCardStatus.loading);
      advance(async, const Duration(seconds: 1));
      r.vm.onSignatureChangeFinished(succeeded: true);
      advance(async, const Duration(seconds: 3));
      expect(r.card.imageUrl, isNot(_thumb(_sigOk)));
      expect(r.card.imageUrl, _original(_sigNullThumb));
    });

    fakeTest('TC-SET-010 변경이 실패하면 진행 중이던 조회 결과는 정상 반영된다', (async) {
      final r = SettingsRig();
      r.h.adapter.on('GET', meSignaturePath, [
        fx(_sigOk, delay: const Duration(seconds: 2)),
      ]);
      r.onGetPush([fx(_pushAllTrue)]);
      r.show(async);
      advance(async, const Duration(seconds: 1));
      r.vm.onSignatureChangeFinished(succeeded: false);
      advance(async, const Duration(seconds: 3));
      expect(r.signatureGets, 1);
      expect(r.card.imageUrl, _thumb(_sigOk));
    });

    fakeTest('TC-SET-011 변경 성공 뒤에는 GET으로 재조회한 썸네일로 바뀐다', (async) {
      final r = SettingsRig();
      r.h.onGetSignature([_sigOk, _sigNullThumb]);
      r.onGetPush([fx(_pushAllTrue)]);
      r.show(async);
      expect(r.card.imageUrl, _thumb(_sigOk));
      r.vm.onSignatureChangeFinished(succeeded: true);
      advance(async, Duration.zero);
      expect(r.signatureGets, 2);
      expect(r.card.imageUrl, _original(_sigNullThumb));
    });

    fakeTest('TC-SET-011 변경 요청의 응답 URL을 썸네일 자리에 넣지 않는다', (async) {
      final r = SettingsRig();
      r.h.onGetSignature([_sigOk, _sigOk]);
      r.onGetPush([fx(_pushAllTrue)]);
      r.show(async);
      r.vm.onSignatureChangeFinished(succeeded: true);
      advance(async, Duration.zero);
      expect(r.card.imageUrl, _thumb(_sigOk), reason: '재조회한 GET 응답의 썸네일만 쓴다');
      expect(r.h.adapter.where('PUT', meSignaturePath), isEmpty);
    });
  });

  group('계정', () {
    fakeTest('TC-SET-041 로그아웃 행을 누르면 로그아웃 확인 대화상자가 열린다', (async) {
      final r = SettingsRig();
      r.vm.onLogoutRowPressed();
      expect(r.vm.state.dialog, SettingsDialog.logout);
    });

    fakeTest('TC-SET-042 로그아웃을 취소하면 API 호출이 없고 설정 화면이 유지된다', (async) {
      final r = SettingsRig();
      r.vm.onLogoutRowPressed();
      r.vm.onDialogCancelled();
      advance(async, Duration.zero);
      expect(r.vm.state.dialog, isNull);
      expect(r.auth.logoutTokens, isEmpty);
      expect(r.h.adapter.requests, isEmpty);
      expect(r.h.store.current, isNotNull);
      expect(r.h.clearedReasons, isEmpty);
    });

    fakeTest('TC-SET-045 탈퇴를 취소하면 DELETE 호출이 0건이다', (async) {
      final r = SettingsRig();
      r.vm.onWithdrawRowPressed();
      expect(r.vm.state.dialog, SettingsDialog.withdraw);
      r.vm.onDialogCancelled();
      advance(async, Duration.zero);
      expect(r.vm.state.dialog, isNull);
      expect(r.auth.deleteCalls, 0);
      expect(r.h.store.current, isNotNull);
    });

    fakeTest('REQ-SET-007 로그아웃을 확인하면 로컬 정리 뒤 refresh token으로 서버 로그아웃을 한다', (
      async,
    ) {
      final r = SettingsRig();
      r.vm.onLogoutRowPressed();
      r.vm.onLogoutConfirmed();
      advance(async, Duration.zero);
      expect(r.otherCleaner.calls, 1);
      expect(r.auth.logoutTokens, ['rt1']);
      expect(r.h.store.current, isNull);
      expect(r.h.clearedReasons, [SessionClearReason.userLogout]);
      expect(r.vm.state.dialog, isNull);
    });

    fakeTest('REQ-SET-007 탈퇴를 확인해 성공하면 정리하고 세션을 지운다(Fake 저장소만 사용)', (async) {
      final r = SettingsRig();
      r.vm.onWithdrawRowPressed();
      r.vm.onWithdrawConfirmed();
      advance(async, Duration.zero);
      expect(r.auth.deleteCalls, 1);
      expect(r.otherCleaner.calls, 1);
      expect(r.h.store.current, isNull);
      expect(r.h.clearedReasons, [SessionClearReason.userLogout]);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('REQ-SET-007 탈퇴가 실패하면 세션을 유지하고 오류 토스트를 띄운다', (async) {
      final r = SettingsRig();
      r.auth.onDelete = () => throw serverError(500);
      r.vm.onWithdrawRowPressed();
      r.vm.onWithdrawConfirmed();
      advance(async, Duration.zero);
      expect(r.h.store.current, isNotNull);
      expect(r.otherCleaner.calls, 0);
      expect(r.toast.messages, [Copy.authWithdrawError]);
      expect(r.vm.state.accountBusy, isFalse);
      expect(r.vm.state.dialog, isNull);
    });

    fakeTest('REQ-SET-007 탈퇴 요청이 취소되면 오류 토스트가 없다', (async) {
      final r = SettingsRig();
      r.auth.onDelete = () => throw ApiError.cancelled();
      r.vm.onWithdrawRowPressed();
      r.vm.onWithdrawConfirmed();
      advance(async, Duration.zero);
      expect(r.h.store.current, isNotNull);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('REQ-SET-007 탈퇴 처리 중에는 busy이고 확인을 다시 눌러도 요청은 한 번이다', (async) {
      final r = SettingsRig();
      final gate = Completer<void>();
      r.auth.onDelete = () => gate.future;
      r.vm.onWithdrawRowPressed();
      r.vm.onWithdrawConfirmed();
      r.vm.onWithdrawConfirmed();
      settle(async);
      expect(r.vm.state.accountBusy, isTrue);
      expect(r.auth.deleteCalls, 1);
      gate.complete();
      settle(async);
      expect(r.vm.state.accountBusy, isFalse);
      expect(r.auth.deleteCalls, 1);
    });

    fakeTest('TC-SET-037 로그아웃 후 다른 계정으로 들어오면 이전 토글·사인이 보이지 않고 새로 조회한다', (
      async,
    ) {
      final r = SettingsRig();
      r.h.onGetSignature([_sigOk, _sigNullThumb]);
      r.onGetPush([fx(_pushAllTrue), fx(_pushTopicOff)]);
      r.show(async);
      expect(r.card.imageUrl, _thumb(_sigOk));
      expect(r.pushState.values, allTrue);

      r.vm.onLogoutRowPressed();
      r.vm.onLogoutConfirmed();
      advance(async, Duration.zero);
      expect(r.pushState.status, PushSettingsStatus.idle);
      expect(r.pushState.values, isNull);
      expect(r.card.imageUrl, isNull);
      expect(r.card.status, SignatureCardStatus.idle);

      r.h.sessions.save(sessionAt(userId: 'user-2'));
      advance(async, Duration.zero);
      r.show(async);
      expect(r.signatureGets, 2);
      expect(r.pushGets, 2);
      expect(r.card.imageUrl, _original(_sigNullThumb));
      expect(r.pushState.values, topicOff);
    });

    fakeTest('REQ-SET-002 게스트의 로그인 버튼은 게스트 세션을 지워 로그인 화면으로 보낸다', (async) {
      final r = SettingsRig(guest: true);
      r.vm.onLoginPressed();
      advance(async, Duration.zero);
      expect(r.h.clearedReasons, [SessionClearReason.userLogout]);
      expect(r.h.adapter.requests, isEmpty);
    });
  });

  group('행 동작', () {
    fakeTest('TC-SET-047 개인정보처리방침·이용약관 행은 각 문서를 여는 이벤트를 낸다', (async) {
      final r = SettingsRig();
      r.vm.onPrivacyPressed();
      r.vm.onTermsPressed();
      advance(async, Duration.zero);
      expect(
        [for (final e in r.events.whereType<OpenLegalDocument>()) e.document],
        [LegalDocument.privacy, LegalDocument.service],
      );
    });

    fakeTest('TC-SET-049 버전정보 값은 빌드 설정의 앱 버전 문자열과 같다', (async) {
      final r = SettingsRig(appVersion: '2.3.4');
      expect(r.vm.state.appVersion, '2.3.4');
    });

    fakeTest('REQ-FDBK-001 회원이 피드백 보내기를 누르면 피드백 화면을 여는 이벤트를 낸다', (async) {
      final r = SettingsRig();
      r.vm.onFeedbackPressed();
      advance(async, Duration.zero);
      expect(r.events.single, isA<OpenFeedback>());
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('TC-FDBK-035 게스트가 피드백 보내기를 누르면 토스트만 뜨고 화면과 API가 없다', (async) {
      final r = SettingsRig(guest: true);
      r.vm.onFeedbackPressed();
      advance(async, Duration.zero);
      expect(r.toast.messages, [Copy.navGuestFeedback]);
      expect(r.events, isEmpty);
      expect(r.h.adapter.requests, isEmpty);
    });

    fakeTest('REQ-SET-004 사인 변경 버튼은 사인 변경 흐름을 여는 이벤트를 낸다', (async) {
      final r = SettingsRig();
      r.vm.onChangeSignaturePressed();
      advance(async, Duration.zero);
      expect(r.events.single, isA<OpenChangeSignature>());
    });
  });
}
