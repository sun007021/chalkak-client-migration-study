import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/settings/data/api_notification_settings_repository.dart';
import 'package:chalkak/features/settings/domain/notification_settings.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart';
import '../../../support/settings_fakes.dart';

const _getAllTrue = 'settings/notification-settings__get-all-true.json';
const _getAiOff = 'settings/notification-settings__get-ai-off.json';
const _getTopicOff = 'settings/notification-settings__get-topic-off.json';
const _getMissing = 'settings/notification-settings__get-field-missing.json';
const _getNull = 'settings/notification-settings__get-null-field.json';
const _getUnauthorized =
    'settings/notification-settings__get-unauthorized.json';
const _patchOk = 'settings/notification-settings__patch-no-content.json';
const _patchError = 'settings/notification-settings__patch-internal-error.json';
const _patchUnauthorized =
    'settings/notification-settings__patch-unauthorized.json';
const _refreshOk = 'auth/refresh__success.json';
const _refreshReauth = 'auth/refresh__reauthentication-required.json';

class _Rig {
  _Rig() : http = AuthHttpHarness(session: sessionAt()) {
    repo = ApiNotificationSettingsRepository(client: http.client);
  }

  final AuthHttpHarness http;
  late final ApiNotificationSettingsRepository repo;

  List<RecordedRequest> get patches =>
      http.adapter.where('PATCH', notificationSettingsPath).toList();
}

void main() {
  fakeTest('TC-SET-014 세 필드를 읽고 모두 켜진 응답은 그대로 반영한다', (async) {
    final r = _Rig();
    r.http.adapter.on('GET', notificationSettingsPath, [fx(_getAllTrue)]);
    expect(resolve(async, r.repo.fetch()), allTrue);
  });

  fakeTest('TC-SET-014 꺼진 AI 설정도 그대로 반영한다', (async) {
    final r = _Rig();
    r.http.adapter.on('GET', notificationSettingsPath, [fx(_getAiOff)]);
    expect(resolve(async, r.repo.fetch()), aiOff);
  });

  fakeTest('TC-SET-014 꺼진 주제 설정도 그대로 반영한다', (async) {
    final r = _Rig();
    r.http.adapter.on('GET', notificationSettingsPath, [fx(_getTopicOff)]);
    expect(resolve(async, r.repo.fetch()), topicOff);
  });

  fakeTest('TC-SET-014 GET은 /notification-settings에 Bearer 헤더로 나간다', (async) {
    final r = _Rig();
    r.http.adapter.on('GET', notificationSettingsPath, [fx(_getAllTrue)]);
    resolve(async, r.repo.fetch());
    final request = r.http.adapter
        .where('GET', notificationSettingsPath)
        .single;
    expect(request.header('authorization'), 'Bearer at1');
    expect(request.body, anyOf(isNull, isEmpty));
  });

  for (final fixture in [_getMissing, _getNull]) {
    fakeTest('TC-SET-015 필드가 없거나 null이면 잘못된 응답이다 ($fixture)', (async) {
      final r = _Rig();
      r.http.adapter.on('GET', notificationSettingsPath, [fx(fixture)]);
      final p = start(async, r.repo.fetch());
      expect(p.done, isTrue);
      expect(p.error, isA<ApiError>());
      expect((p.error! as ApiError).isInvalidResponse, isTrue);
    });
  }

  for (final (setting, key) in [
    (PushSetting.topic, 'topicPushEnabled'),
    (PushSetting.moderation, 'moderationPushEnabled'),
    (PushSetting.aiReview, 'aiReviewPushEnabled'),
  ]) {
    for (final enabled in [false, true]) {
      fakeTest(
        'TC-SET-019 TC-SET-020 TC-SET-021 TC-SET-036 PATCH 바디는 {$key: $enabled} 하나뿐이다',
        (async) {
          final r = _Rig();
          r.http.adapter.on('PATCH', notificationSettingsPath, [fx(_patchOk)]);
          resolve(async, r.repo.update(setting, enabled));
          final request = r.patches.single;
          expect(request.jsonBody, {key: enabled});
          expect(request.header('authorization'), 'Bearer at1');
          expect(request.header('content-type'), contains('application/json'));
        },
      );
    }
  }

  fakeTest('TC-SET-022 PATCH 204 본문 없음은 성공이고 본문을 해석하지 않는다', (async) {
    final r = _Rig();
    r.http.adapter.on('PATCH', notificationSettingsPath, [fx(_patchOk)]);
    final p = start(async, r.repo.update(PushSetting.topic, false));
    expect(p.succeeded, isTrue);
    expect(r.patches, hasLength(1));
  });

  fakeTest('TC-SET-034 GET이 401이면 갱신 뒤 원 요청을 1회 재전송한다', (async) {
    final r = _Rig();
    r.http.adapter.on('GET', notificationSettingsPath, [
      fx(_getUnauthorized),
      fx(_getAllTrue),
    ]);
    r.http.adapter.on('POST', AuthHttpHarness.refreshPath, [fx(_refreshOk)]);
    expect(resolve(async, r.repo.fetch()), allTrue);
    expect(r.http.adapter.count('GET', notificationSettingsPath), 2);
    expect(r.http.adapter.count('POST', AuthHttpHarness.refreshPath), 1);
  });

  fakeTest('TC-SET-034 PATCH가 401이면 갱신 뒤 원 요청을 1회 재전송한다', (async) {
    final r = _Rig();
    r.http.adapter.on('PATCH', notificationSettingsPath, [
      fx(_patchUnauthorized),
      fx(_patchOk),
    ]);
    r.http.adapter.on('POST', AuthHttpHarness.refreshPath, [fx(_refreshOk)]);
    final p = start(async, r.repo.update(PushSetting.moderation, false));
    expect(p.succeeded, isTrue);
    expect(r.patches, hasLength(2));
    expect(r.patches.last.jsonBody, {'moderationPushEnabled': false});
    expect(r.http.adapter.count('POST', AuthHttpHarness.refreshPath), 1);
  });

  fakeTest('TC-SET-034 GET이 REAUTHENTICATION_REQUIRED면 세션을 지우고 오류로 끝난다', (
    async,
  ) {
    final r = _Rig();
    r.http.adapter.on('GET', notificationSettingsPath, [fx(_getUnauthorized)]);
    r.http.adapter.on('POST', AuthHttpHarness.refreshPath, [
      fx(_refreshReauth),
    ]);
    final p = start(async, r.repo.fetch());
    expect(p.error, isA<ApiError>());
    expect(r.http.clearedReasons, [
      SessionClearReason.reauthenticationRequired,
    ]);
    expect(r.http.adapter.count('GET', notificationSettingsPath), 1);
  });

  fakeTest('TC-SET-034 PATCH가 REAUTHENTICATION_REQUIRED면 세션을 지우고 오류로 끝난다', (
    async,
  ) {
    final r = _Rig();
    r.http.adapter.on('PATCH', notificationSettingsPath, [
      fx(_patchUnauthorized),
    ]);
    r.http.adapter.on('POST', AuthHttpHarness.refreshPath, [
      fx(_refreshReauth),
    ]);
    final p = start(async, r.repo.update(PushSetting.topic, true));
    expect(p.error, isA<ApiError>());
    expect(r.http.clearedReasons, [
      SessionClearReason.reauthenticationRequired,
    ]);
    expect(r.patches, hasLength(1));
  });

  fakeTest('TC-SET-035 PATCH가 500이면 0.5초, 1초 백오프로 최대 2회 재시도한 뒤 실패한다', (async) {
    final r = _Rig();
    r.http.adapter.on('PATCH', notificationSettingsPath, [fx(_patchError)]);
    final p = start(async, r.repo.update(PushSetting.aiReview, false));
    expect(p.done, isFalse);
    advance(async, const Duration(seconds: 3));
    expect(p.error, isA<ApiError>());
    expect((p.error! as ApiError).status, 500);
    final at = [for (final q in r.patches) q.at.difference(t0)];
    expect(at, [
      Duration.zero,
      const Duration(milliseconds: 500),
      const Duration(milliseconds: 1500),
    ]);
    expect(
      {for (final q in r.patches) q.jsonBody!.toString()},
      {'{aiReviewPushEnabled: false}'},
    );
  });
}
