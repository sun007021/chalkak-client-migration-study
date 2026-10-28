import 'dart:async';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/auth/domain/session_use_cases.dart';
import 'package:chalkak/features/auth/domain/user_data_cleaner.dart';
import 'package:chalkak/features/navigation/domain/guest_guard.dart';
import 'package:chalkak/features/onboarding/domain/legal_document.dart';
import 'package:chalkak/features/onboarding/presentation/legal_document_view_model.dart';
import 'package:chalkak/features/settings/data/api_notification_settings_repository.dart';
import 'package:chalkak/features/settings/domain/notification_permission.dart';
import 'package:chalkak/features/settings/domain/notification_settings.dart';
import 'package:chalkak/features/settings/domain/notification_settings_repository.dart';
import 'package:chalkak/features/settings/presentation/push_settings_view_model.dart';
import 'package:chalkak/features/settings/presentation/settings_data_cleaner.dart';
import 'package:chalkak/features/settings/presentation/settings_view_model.dart';
import 'package:chalkak/features/signature/presentation/signature_card_view_model.dart';
import 'package:dio/dio.dart';
import 'package:fake_async/fake_async.dart';

import 'auth_fakes.dart';
import 'fake_adapter.dart' show FakeResponse;
import 'fake_analytics_tracker.dart';
import 'home_fakes.dart' show RecordingToast;
import 'net_harness.dart' show advance, sessionAt, sessionGuest, v1;
import 'onboarding_fakes.dart';

export 'home_fakes.dart' show RecordingToast, failing, fx;

const notificationSettingsPath = '$v1/notification-settings';

const allTrue = NotificationSettings(
  topic: true,
  moderation: true,
  aiReview: true,
);

const topicOff = NotificationSettings(
  topic: false,
  moderation: true,
  aiReview: true,
);

const aiOff = NotificationSettings(
  topic: true,
  moderation: true,
  aiReview: false,
);

/// 상태 코드만 가진 서버 오류.
ApiError serverError(int status) => ApiError.fromErrorResponse(status, null);

/// 기기 알림 권한 Fake. 호출 횟수를 센다.
class FakePushPermission implements NotificationPermissionGateway {
  NotificationPermission current = NotificationPermission.granted;

  /// [request]가 돌려줄 값(허용 여부).
  bool requestResult = true;

  int statusCalls = 0;
  int requestCalls = 0;
  int openSettingsCalls = 0;

  @override
  Future<NotificationPermission> status() async {
    statusCalls++;
    return current;
  }

  @override
  Future<bool> request() async {
    requestCalls++;
    return requestResult;
  }

  @override
  Future<void> openSystemSettings() async {
    openSettingsCalls++;
  }
}

class PendingFetch {
  PendingFetch(this.cancelToken);

  final CancelToken? cancelToken;
  final Completer<NotificationSettings> completer =
      Completer<NotificationSettings>();

  void complete(NotificationSettings value) => completer.complete(value);
  void fail(Object error) => completer.completeError(error);
}

class UpdateCall {
  UpdateCall(this.setting, this.enabled, this.cancelToken);

  final PushSetting setting;
  final bool enabled;
  final CancelToken? cancelToken;
  final Completer<void> completer = Completer<void>();

  void complete() => completer.complete();
  void fail(Object error) => completer.completeError(error);
}

/// 서버 대신 스크립트로 답하는 저장소.
/// 기본은 즉시 응답한다([fetchValue], [fetchError], [updateErrors]). [holdFetch], [holdUpdate]가
/// true면 호출을 모아 두고 테스트가 [fetchCalls], [updateCalls]로 직접 끝낸다. 보류 중인 호출은
/// 취소 토큰이 취소되면 `ApiError.cancelled`로 끝난다.
class FakeNotificationSettingsRepository
    implements NotificationSettingsRepository {
  NotificationSettings fetchValue = allTrue;
  Object? fetchError;
  final Map<PushSetting, Object> updateErrors = {};
  bool holdFetch = false;
  bool holdUpdate = false;

  final List<PendingFetch> fetchCalls = [];
  final List<UpdateCall> updateCalls = [];

  @override
  Future<NotificationSettings> fetch({CancelToken? cancelToken}) {
    final call = PendingFetch(cancelToken);
    fetchCalls.add(call);
    if (holdFetch) {
      _cancelOnToken(cancelToken, call.completer);
      return call.completer.future;
    }
    final error = fetchError;
    if (error != null) return Future<NotificationSettings>.error(error);
    return Future.value(fetchValue);
  }

  @override
  Future<void> update(
    PushSetting setting,
    bool enabled, {
    CancelToken? cancelToken,
  }) {
    final call = UpdateCall(setting, enabled, cancelToken);
    updateCalls.add(call);
    if (holdUpdate) {
      _cancelOnToken(cancelToken, call.completer);
      return call.completer.future;
    }
    final error = updateErrors[setting];
    if (error != null) return Future<void>.error(error);
    return Future<void>.value();
  }

  static void _cancelOnToken(CancelToken? token, Completer<Object?> completer) {
    token?.whenCancel.then((_) {
      if (!completer.isCompleted) completer.completeError(ApiError.cancelled());
    });
  }
}

/// 설정 탭 한 벌: 실제 `ApiClient` + [FakeAdapter] 위에 사인 카드, 푸시 설정, 설정 ViewModel을 얹는다.
/// 로그아웃·탈퇴는 [FakeAuthRepository]로만 부른다(탈퇴 API는 실제로 나가지 않는다).
/// 설정 cleaner는 로그아웃 때 불리는 cleaner 묶음에 들어 있다.
class SettingsRig {
  SettingsRig({this.guest = false, Session? session, this.appVersion = '1.1.1'})
    : h = OnboardingHarness(
        session: guest ? sessionGuest() : (session ?? sessionAt()),
      ) {
    signature = SignatureCardViewModel(
      repository: h.signatureRepository,
      isGuest: guest,
    );
    push = PushSettingsViewModel(
      repository: ApiNotificationSettingsRepository(client: h.client),
      permission: permission,
      toast: toast,
    );
    final cleaners = CompositeUserDataCleaner([dataCleaner, otherCleaner]);
    vm = SettingsViewModel(
      signature: signature,
      push: push,
      logout: LogoutUseCase(
        sessions: h.sessions,
        repository: auth,
        cleaner: cleaners,
      ),
      withdraw: WithdrawUseCase(
        sessions: h.sessions,
        repository: auth,
        cleaner: cleaners,
      ),
      leaveGuest: LeaveGuestUseCase(sessions: h.sessions),
      guestGuard: GuestGuard(isGuest: guest, toast: toast),
      toast: toast,
      analytics: analytics,
      isGuest: guest,
      appVersion: appVersion,
    );
    dataCleaner.attach(vm);
    vm.events.listen(events.add);
  }

  final bool guest;
  final String appVersion;
  final OnboardingHarness h;
  final RecordingToast toast = RecordingToast();
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();
  final FakePushPermission permission = FakePushPermission();
  final FakeAuthRepository auth = FakeAuthRepository();
  final FakeUserDataCleaner otherCleaner = FakeUserDataCleaner();
  final SettingsDataCleaner dataCleaner = SettingsDataCleaner();
  final List<SettingsEvent> events = [];
  late final SignatureCardViewModel signature;
  late final PushSettingsViewModel push;
  late final SettingsViewModel vm;

  PushSettingsState get pushState => push.state;
  SignatureCardState get card => signature.state;

  /// `GET /notification-settings` 응답 열.
  void onGetPush(List<FakeResponse> responses) =>
      h.adapter.on('GET', notificationSettingsPath, responses);

  /// `PATCH /notification-settings` 응답 열.
  void onPatchPush(List<FakeResponse> responses) =>
      h.adapter.on('PATCH', notificationSettingsPath, responses);

  int get pushGets => h.adapter.count('GET', notificationSettingsPath);
  int get pushPatches => h.adapter.count('PATCH', notificationSettingsPath);
  int get signatureGets => h.adapter.count('GET', meSignaturePath);

  /// 탭이 보이는 동작을 시작하고 [wait]만큼 가상 시간을 흘린다.
  void show(FakeAsync async, [Duration wait = Duration.zero]) {
    vm.onTabShown();
    advance(async, wait);
  }
}

/// 약관 문서 시트용 ViewModel 팩토리(분석은 [analytics]에 기록, 외부 링크는 [launcher]).
LegalDocumentViewModel Function(LegalDocument document) legalFactory({
  required FakeAnalyticsTracker analytics,
  FakeExternalLinkLauncher? launcher,
}) {
  final fallback = launcher ?? FakeExternalLinkLauncher();
  return (document) => LegalDocumentViewModel(
    document: document,
    launcher: fallback,
    analytics: analytics,
  );
}
