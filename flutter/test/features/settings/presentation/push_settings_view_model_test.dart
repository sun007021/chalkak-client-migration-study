import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/push/notification_permission.dart';
import 'package:chalkak/features/settings/domain/notification_settings.dart';
import 'package:chalkak/features/settings/presentation/push_settings_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/settings_fakes.dart';

class _Rig {
  _Rig() {
    vm = PushSettingsViewModel(
      repository: repo,
      permission: permission,
      toast: toast,
    );
  }

  final FakeNotificationSettingsRepository repo =
      FakeNotificationSettingsRepository();
  final FakePushPermission permission = FakePushPermission();
  final RecordingToast toast = RecordingToast();
  late final PushSettingsViewModel vm;

  PushSettingsState get state => vm.state;

  /// 값을 불러와 ready로 만든다.
  Future<void> ready([NotificationSettings? values]) async {
    if (values != null) repo.fetchValue = values;
    await vm.load();
    expect(state.status, PushSettingsStatus.ready);
  }

  /// 저장 요청을 직접 끝낼 수 있게 보류한다.
  void holdUpdates() => repo.holdUpdate = true;
}

void main() {
  group('불러오기', () {
    test('TC-SET-017 처음 불러오는 동안은 loading이고 값이 없다', () async {
      final r = _Rig();
      r.repo.holdFetch = true;
      final loading = r.vm.load();
      expect(r.state.status, PushSettingsStatus.loading);
      expect(r.state.values, isNull);
      r.repo.fetchCalls.single.complete(allTrue);
      await loading;
      expect(r.state.status, PushSettingsStatus.ready);
      expect(r.state.values, allTrue);
    });

    test('TC-SET-014 꺼진 AI 설정도 그대로 상태에 반영한다', () async {
      final r = _Rig();
      await r.ready(aiOff);
      expect(r.state.values!.aiReview, isFalse);
      expect(r.state.values!.topic, isTrue);
    });

    test('REQ-SET-008 불러오는 중에 다시 불러와도 요청은 한 번이다', () async {
      final r = _Rig();
      r.repo.holdFetch = true;
      final first = r.vm.load();
      fireAndForget(r.vm.onSettingsTabShown());
      fireAndForget(r.vm.load());
      expect(r.repo.fetchCalls, hasLength(1));
      r.repo.fetchCalls.single.complete(allTrue);
      await first;
      expect(r.repo.fetchCalls, hasLength(1));
    });

    test('REQ-SET-008 설정 탭이 다시 보이면 재조회해 새 값으로 바꾼다', () async {
      final r = _Rig();
      await r.ready(allTrue);
      r.repo.fetchValue = topicOff;
      await r.vm.onSettingsTabShown();
      expect(r.repo.fetchCalls, hasLength(2));
      expect(r.state.status, PushSettingsStatus.ready);
      expect(r.state.values, topicOff);
    });

    test('TC-SET-016 조회가 실패하면 loadFailed이고 값을 지어내지 않으며 토스트가 없다', () async {
      final r = _Rig();
      r.repo.fetchError = serverError(500);
      await r.vm.load();
      expect(r.state.status, PushSettingsStatus.loadFailed);
      expect(r.state.values, isNull);
      expect(r.toast.messages, isEmpty);
    });

    test('TC-SET-016 다시 시도하면 다시 불러와 ready가 된다', () async {
      final r = _Rig();
      r.repo.fetchError = serverError(500);
      await r.vm.load();
      r.repo.fetchError = null;
      await r.vm.retry();
      expect(r.repo.fetchCalls, hasLength(2));
      expect(r.state.status, PushSettingsStatus.ready);
      expect(r.state.values, allTrue);
    });

    test('TC-SET-015 잘못된 응답(필드 누락·null)은 조회 실패와 같이 loadFailed다', () async {
      final r = _Rig();
      r.repo.fetchError = ApiError.invalidResponse(status: 200);
      await r.vm.load();
      expect(r.state.status, PushSettingsStatus.loadFailed);
      expect(r.state.values, isNull);
    });

    test('TC-SET-034 조회 401은 토스트 없이 끝나고 값을 쓰지 않는다', () async {
      final r = _Rig();
      r.repo.fetchError = const ApiError(
        kind: ApiErrorKind.server,
        status: 401,
        errorCode: ApiErrorCode.reauthenticationRequired,
      );
      await r.vm.load();
      expect(r.state.values, isNull);
      expect(r.toast.messages, isEmpty);
    });

    test('TC-SET-033 재조회가 실패하면 오래된 서버 값 기준으로 바꾸지 않는다', () async {
      final r = _Rig();
      await r.ready();
      r.repo.fetchError = serverError(500);
      await r.vm.onSettingsTabShown();
      expect(r.state.status, PushSettingsStatus.loadFailed);
      expect(r.state.values, isNull);
      await r.vm.toggle(PushSetting.topic, false);
      expect(r.repo.updateCalls, isEmpty);
      expect(r.state.values, isNull);
    });

    test('TC-SET-033 로딩 중에는 스위치 입력이 요청을 만들지 않는다', () async {
      final r = _Rig();
      r.repo.holdFetch = true;
      final loading = r.vm.load();
      await r.vm.toggle(PushSetting.topic, false);
      expect(r.repo.updateCalls, isEmpty);
      r.repo.fetchCalls.single.complete(allTrue);
      await loading;
    });
  });

  group('낙관적 저장', () {
    test('TC-SET-023 탭하면 응답을 기다리지 않고 즉시 새 값으로 바뀐다', () async {
      final r = _Rig();
      await r.ready();
      r.holdUpdates();
      final saving = r.vm.toggle(PushSetting.topic, false);
      expect(r.state.values!.topic, isFalse);
      expect(r.state.saving, {PushSetting.topic});
      r.repo.updateCalls.single.complete();
      await saving;
      expect(r.state.values!.topic, isFalse);
      expect(r.state.saving, isEmpty);
    });

    for (final (setting, enabled) in [
      (PushSetting.topic, false),
      (PushSetting.moderation, false),
      (PushSetting.aiReview, false),
    ]) {
      test(
        'TC-SET-019 TC-SET-020 TC-SET-021 $setting 변경은 그 항목 하나만 저장한다',
        () async {
          final r = _Rig();
          await r.ready();
          await r.vm.toggle(setting, enabled);
          final call = r.repo.updateCalls.single;
          expect(call.setting, setting);
          expect(call.enabled, enabled);
          for (final other in PushSetting.values.where((s) => s != setting)) {
            expect(r.state.values!.valueOf(other), isTrue);
          }
        },
      );
    }

    test('REQ-SET-012 저장 성공은 서버 값으로 다시 덮어쓰지 않는다', () async {
      final r = _Rig();
      await r.ready();
      await r.vm.toggle(PushSetting.topic, false);
      expect(r.repo.fetchCalls, hasLength(1));
      expect(r.state.values!.topic, isFalse);
    });

    test('TC-SET-024 저장이 실패하면 그 토글만 이전 값으로 돌아오고 토스트가 뜬다', () async {
      final r = _Rig();
      await r.ready();
      r.repo.updateErrors[PushSetting.topic] = serverError(500);
      await r.vm.toggle(PushSetting.topic, false);
      expect(r.state.values, allTrue);
      expect(r.state.saving, isEmpty);
      expect(r.toast.messages, [Copy.settingsPushSaveError]);
    });

    test('TC-SET-024 네트워크 오류도 같은 방식으로 되돌리고 토스트를 띄운다', () async {
      final r = _Rig();
      await r.ready();
      r.repo.updateErrors[PushSetting.moderation] = ApiError.network();
      await r.vm.toggle(PushSetting.moderation, false);
      expect(r.state.values, allTrue);
      expect(r.toast.messages, [Copy.settingsPushSaveError]);
    });

    test('TC-SET-025 주제 저장이 실패해도 이미 성공한 검수 변경은 유지된다', () async {
      final r = _Rig();
      await r.ready();
      r.repo.updateErrors[PushSetting.topic] = serverError(500);
      await r.vm.toggle(PushSetting.moderation, false);
      await r.vm.toggle(PushSetting.topic, false);
      expect(r.state.values!.moderation, isFalse);
      expect(r.state.values!.topic, isTrue);
    });

    test('TC-SET-025 동시에 진행 중일 때도 다른 항목의 결과는 그대로다', () async {
      final r = _Rig();
      await r.ready();
      r.holdUpdates();
      final moderation = r.vm.toggle(PushSetting.moderation, false);
      final topic = r.vm.toggle(PushSetting.topic, false);
      r.repo.updateCalls[0].complete();
      r.repo.updateCalls[1].fail(serverError(500));
      await Future.wait([moderation, topic]);
      expect(r.state.values!.moderation, isFalse);
      expect(r.state.values!.topic, isTrue);
      expect(r.toast.messages, [Copy.settingsPushSaveError]);
    });

    test('TC-SET-026 검수 저장이 실패해도 이미 성공한 주제 변경은 유지된다', () async {
      final r = _Rig();
      await r.ready();
      r.repo.updateErrors[PushSetting.moderation] = serverError(500);
      await r.vm.toggle(PushSetting.topic, false);
      await r.vm.toggle(PushSetting.moderation, false);
      expect(r.state.values!.topic, isFalse);
      expect(r.state.values!.moderation, isTrue);
    });

    test('TC-SET-027 AI 저장이 실패해도 다른 설정은 유지되고 진행 중 중복 저장은 막힌다', () async {
      final r = _Rig();
      await r.ready();
      await r.vm.toggle(PushSetting.topic, false);
      r.holdUpdates();
      final first = r.vm.toggle(PushSetting.aiReview, false);
      final second = r.vm.toggle(PushSetting.aiReview, true);
      expect(
        r.repo.updateCalls.where((c) => c.setting == PushSetting.aiReview),
        hasLength(1),
      );
      r.repo.updateCalls.last.fail(serverError(500));
      await Future.wait([first, second]);
      expect(r.state.values!.aiReview, isTrue);
      expect(r.state.values!.topic, isFalse);
    });

    test('TC-SET-027 실패로 돌아온 뒤에는 같은 항목을 다시 저장할 수 있다', () async {
      final r = _Rig();
      await r.ready();
      r.repo.updateErrors[PushSetting.aiReview] = serverError(500);
      await r.vm.toggle(PushSetting.aiReview, false);
      r.repo.updateErrors.clear();
      await r.vm.toggle(PushSetting.aiReview, false);
      expect(r.state.values!.aiReview, isFalse);
      expect(r.repo.updateCalls, hasLength(2));
    });

    test('TC-SET-028 같은 항목이 저장 중이면 두 번째 입력은 무시되고 요청은 한 번이다', () async {
      final r = _Rig();
      await r.ready();
      r.holdUpdates();
      final first = r.vm.toggle(PushSetting.topic, false);
      final second = r.vm.toggle(PushSetting.topic, true);
      expect(r.repo.updateCalls, hasLength(1));
      expect(r.state.values!.topic, isFalse);
      r.repo.updateCalls.single.complete();
      await Future.wait([first, second]);
      expect(r.state.values!.topic, isFalse);
    });

    test('TC-SET-029 주제 저장 중에도 검수·AI 토글은 막히지 않고 별도 요청이 나간다', () async {
      final r = _Rig();
      await r.ready();
      r.holdUpdates();
      final futures = [
        r.vm.toggle(PushSetting.topic, false),
        r.vm.toggle(PushSetting.moderation, false),
        r.vm.toggle(PushSetting.aiReview, false),
      ];
      expect(r.repo.updateCalls.map((c) => c.setting), [
        PushSetting.topic,
        PushSetting.moderation,
        PushSetting.aiReview,
      ]);
      expect(r.state.saving, PushSetting.values.toSet());
      for (final call in r.repo.updateCalls) {
        call.complete();
      }
      await Future.wait(futures);
      expect(
        r.state.values,
        const NotificationSettings(
          topic: false,
          moderation: false,
          aiReview: false,
        ),
      );
    });

    test('TC-SET-030 저장 중 화면을 떠나면 이전 값으로 복구되고 오류 토스트는 없다', () async {
      final r = _Rig();
      await r.ready();
      r.holdUpdates();
      final saving = r.vm.toggle(PushSetting.topic, false);
      r.vm.cancelPending();
      await saving;
      expect(r.repo.updateCalls.single.cancelToken!.isCancelled, isTrue);
      expect(r.state.values, allTrue);
      expect(r.state.saving, isEmpty);
      expect(r.toast.messages, isEmpty);
    });

    test('TC-SET-030 dispose도 진행 중 요청을 취소하고 토스트를 만들지 않는다', () async {
      final r = _Rig();
      await r.ready();
      r.holdUpdates();
      final saving = r.vm.toggle(PushSetting.topic, false);
      r.vm.dispose();
      await saving;
      expect(r.repo.updateCalls.single.cancelToken!.isCancelled, isTrue);
      expect(r.toast.messages, isEmpty);
    });

    test('TC-SET-034 저장 401은 토스트 없이 되돌린다(로그인 이동은 앱 몫)', () async {
      final r = _Rig();
      await r.ready();
      r.repo.updateErrors[PushSetting.topic] = const ApiError(
        kind: ApiErrorKind.server,
        status: 401,
        errorCode: ApiErrorCode.reauthenticationRequired,
      );
      await r.vm.toggle(PushSetting.topic, false);
      expect(r.state.values, allTrue);
      expect(r.toast.messages, isEmpty);
    });

    test('TC-SET-036 현재와 같은 값으로 바꾸려면 빈 PATCH가 되므로 요청하지 않는다', () async {
      final r = _Rig();
      await r.ready();
      for (final setting in PushSetting.values) {
        await r.vm.toggle(setting, true);
      }
      expect(r.repo.updateCalls, isEmpty);
      expect(r.state.values, allTrue);
      expect(r.state.saving, isEmpty);
    });
  });

  group('계정 전환', () {
    test('TC-SET-031 저장 도중 계정이 바뀌면 이전 계정의 성공 응답을 반영하지 않는다', () async {
      final r = _Rig();
      await r.ready();
      r.holdUpdates();
      final saving = r.vm.toggle(PushSetting.topic, false);
      await r.vm.clearAll();
      r.repo.updateCalls.single.complete();
      await saving;
      expect(r.state.status, PushSettingsStatus.idle);
      expect(r.state.values, isNull);
      expect(r.state.saving, isEmpty);
      expect(r.toast.messages, isEmpty);
    });

    test('TC-SET-031 이전 계정의 저장 실패도 되돌리기·토스트를 만들지 않는다', () async {
      final r = _Rig();
      await r.ready();
      r.holdUpdates();
      final saving = r.vm.toggle(PushSetting.moderation, false);
      await r.vm.clearAll();
      r.repo.updateCalls.single.fail(serverError(500));
      await saving;
      expect(r.state.values, isNull);
      expect(r.toast.messages, isEmpty);
    });

    test('TC-SET-032 reset 이후 늦게 도착한 이전 계정 조회 응답은 반영하지 않는다', () async {
      final r = _Rig();
      r.repo.holdFetch = true;
      final loading = r.vm.load();
      await r.vm.clearAll();
      r.repo.fetchCalls.single.complete(allTrue);
      await loading;
      expect(r.state.status, PushSettingsStatus.idle);
      expect(r.state.values, isNull);
    });

    test('TC-SET-037 비운 뒤에는 이전 계정 값이 보이지 않고 새로 조회한 값이 보인다', () async {
      final r = _Rig();
      await r.ready(aiOff);
      await r.vm.clearAll();
      expect(r.state.status, PushSettingsStatus.idle);
      expect(r.state.values, isNull);
      r.repo.fetchValue = topicOff;
      await r.vm.onSettingsTabShown();
      expect(r.repo.fetchCalls, hasLength(2));
      expect(r.state.values, topicOff);
    });
  });

  group('기기 알림 권한', () {
    test('TC-SET-038 권한이 거부면 켜려 할 때 시스템 알림 설정을 한 번 열고 값은 바꾸지 않는다', () async {
      final r = _Rig();
      await r.ready(topicOff);
      r.permission.current = OsPermissionStatus.denied;
      await r.vm.toggle(PushSetting.topic, true);
      expect(r.permission.openSettingsCalls, 1);
      expect(r.repo.updateCalls, isEmpty);
      expect(r.state.values, topicOff);
      expect(r.toast.messages, isEmpty);
    });

    test('TC-SET-038 권한이 허용이면 시스템 설정을 열지 않고 정상 저장한다', () async {
      final r = _Rig();
      await r.ready(topicOff);
      await r.vm.toggle(PushSetting.topic, true);
      expect(r.permission.openSettingsCalls, 0);
      expect(r.repo.updateCalls.single.enabled, isTrue);
      expect(r.state.values!.topic, isTrue);
    });

    test('REQ-SET-016 권한이 거부여도 끄는 것은 정상 저장 흐름을 따른다', () async {
      final r = _Rig();
      await r.ready();
      r.permission.current = OsPermissionStatus.denied;
      await r.vm.toggle(PushSetting.topic, false);
      expect(r.permission.openSettingsCalls, 0);
      expect(r.repo.updateCalls.single.enabled, isFalse);
      expect(r.state.values!.topic, isFalse);
    });

    test('REQ-SET-018 권한 미결정에서 켜면 요청을 띄우고 허용되면 저장한다', () async {
      final r = _Rig();
      await r.ready(aiOff);
      r.permission.current = OsPermissionStatus.notDetermined;
      await r.vm.toggle(PushSetting.aiReview, true);
      expect(r.permission.requestCalls, 1);
      expect(r.permission.openSettingsCalls, 0);
      expect(r.repo.updateCalls.single.enabled, isTrue);
      expect(r.state.values!.aiReview, isTrue);
    });

    test('REQ-SET-018 권한 요청이 거부되면 값도 서버도 바꾸지 않는다', () async {
      final r = _Rig();
      await r.ready(aiOff);
      r.permission.current = OsPermissionStatus.notDetermined;
      r.permission.requestResult = false;
      await r.vm.toggle(PushSetting.aiReview, true);
      expect(r.permission.requestCalls, 1);
      expect(r.repo.updateCalls, isEmpty);
      expect(r.state.values, aiOff);
    });

    test('REQ-SET-017 권한 상태는 탭할 때마다 다시 읽고 서버 값은 그대로 둔다', () async {
      final r = _Rig();
      await r.ready(topicOff);
      r.permission.current = OsPermissionStatus.denied;
      await r.vm.toggle(PushSetting.topic, true);
      r.permission.current = OsPermissionStatus.granted;
      await r.vm.toggle(PushSetting.topic, true);
      expect(r.permission.openSettingsCalls, 1);
      expect(r.repo.updateCalls, hasLength(1));
      expect(r.state.values!.topic, isTrue);
    });
  });
}

/// 결과를 기다리지 않고 시작만 한다.
void fireAndForget(Future<void> future) {
  future.ignore();
}
