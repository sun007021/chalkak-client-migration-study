import 'package:chalkak/features/settings/presentation/push_settings_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, sessionAt;
import '../../../support/onboarding_fakes.dart' show meSignaturePath;
import '../../../support/settings_fakes.dart';

const _sigOk = 'signature/users-me-signature__get-success.json';
const _pushTopicOff = 'settings/notification-settings__get-topic-off.json';
const _pushAllTrue = 'settings/notification-settings__get-all-true.json';

/// 계정 전환 중 늦게 도착하는 이전 계정 응답(TC-AUTH-042). 네트워크 계층은 TC-NET-057이,
/// 설정 탭 각 카드의 reset은 TC-SET-032·037이 보고, 여기서는 로그아웃 -> 다른 계정 로그인 흐름 전체를 본다.
void main() {
  fakeTest(
    'TC-AUTH-042 계정 A의 설정 조회가 진행 중일 때 로그아웃하고 B가 들어오면 A의 늦은 응답은 어떤 상태에도 반영되지 않는다',
    (async) {
      final r = SettingsRig(session: sessionAt(userId: 'account-A'));
      r.h.adapter
        ..on('GET', meSignaturePath, [
          fx(_sigOk, delay: const Duration(seconds: 5)),
          fx(_sigOk),
        ])
        ..on('GET', notificationSettingsPath, [
          fx(_pushTopicOff, delay: const Duration(seconds: 5)),
          fx(_pushAllTrue),
        ]);
      // A: 설정 탭이 열려 요청이 나가 있다.
      r.show(async);
      expect(r.signatureGets, 1);
      expect(r.pushGets, 1);

      // A 로그아웃(캐시 정리) -> B 로그인 -> B의 설정 탭.
      r.vm.onLogoutRowPressed();
      r.vm.onLogoutConfirmed();
      advance(async, const Duration(milliseconds: 100));
      r.h.sessions.save(sessionAt(userId: 'account-B'));
      advance(async, Duration.zero);
      r.show(async, const Duration(seconds: 1));
      expect(r.pushState.values?.topic, isTrue, reason: 'B의 값');
      expect(r.card.imageUrl, isNotNull, reason: 'B의 사인');

      // 이제서야 A의 응답이 도착한다(둘 다 B의 상태를 덮지 않는다).
      advance(async, const Duration(seconds: 10));
      expect(r.pushState.status, PushSettingsStatus.ready);
      expect(r.pushState.values?.topic, isTrue);
      expect(r.pushState.values?.moderation, isTrue);
      expect(r.card.imageUrl, isNotNull);
      expect(r.toast.messages, isEmpty);
    },
  );
}
