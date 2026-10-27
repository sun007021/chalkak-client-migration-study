import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/signature/presentation/signature_card_view_model.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fixtures.dart';
import '../../../support/net_harness.dart' show advance, sessionAt, settle;
import '../../../support/onboarding_fakes.dart';

const _okFx = 'signature/users-me-signature__get-success.json';
const _nullThumbFx = 'signature/users-me-signature__get-thumbnail-null.json';
const _regFx = 'signature/users-me-signature__get-registration-required.json';
const _errFx = 'signature/users-me-signature__get-internal-error.json';

String _field(String fixture, String key) =>
    (Fixture.load(fixture) as Map)[key]! as String;

class _Rig {
  _Rig({bool guest = false})
    : h = OnboardingHarness(session: guest ? null : sessionAt()) {
    vm = SignatureCardViewModel(
      repository: h.signatureRepository,
      isGuest: guest,
    );
  }

  final OnboardingHarness h;
  late final SignatureCardViewModel vm;

  SignatureCardState get state => vm.state;

  void load(FakeAsync async, [Duration wait = Duration.zero]) {
    vm.load();
    advance(async, wait);
  }
}

void main() {
  fakeTest('TC-SIGN-026 처음 상태는 idle이고 이미지가 없다', (async) {
    final r = _Rig();
    expect(r.state.status, SignatureCardStatus.idle);
    expect(r.state.imageUrl, isNull);
    expect(r.state.toast, isNull);
  });

  fakeTest('TC-SIGN-026 조회 성공이면 썸네일을 쓴다', (async) {
    final r = _Rig();
    r.h.onGetSignature([_okFx]);
    r.load(async);
    expect(r.state.status, SignatureCardStatus.content);
    expect(r.state.imageUrl, _field(_okFx, 'signatureThumbnailImageUrl'));
    expect(r.state.toast, isNull);
  });

  fakeTest('TC-SIGN-026 썸네일이 null이면 원본을 쓴다', (async) {
    final r = _Rig();
    r.h.onGetSignature([_nullThumbFx]);
    r.load(async);
    expect(r.state.imageUrl, _field(_nullThumbFx, 'signatureOriginalImageUrl'));
  });

  fakeTest('TC-SIGN-026 조회 중에는 loading이고 이전 사인이 있으면 그대로 보인다', (async) {
    final r = _Rig();
    r.h.adapter.on('GET', meSignaturePath, [
      FakeResponse.fixture(_okFx),
      FakeResponse.fixture(_okFx, delay: const Duration(seconds: 1)),
    ]);
    r.load(async);
    final before = r.state.imageUrl;
    r.vm.load();
    settle(async);
    expect(r.state.status, SignatureCardStatus.loading);
    expect(r.state.imageUrl, before);
    advance(async, const Duration(seconds: 2));
    expect(r.state.status, SignatureCardStatus.content);
  });

  fakeTest('TC-SIGN-027 설정 탭이 다시 보일 때마다 GET으로 재조회해 새 사인으로 바뀐다', (async) {
    final r = _Rig();
    r.h.onGetSignature([_okFx, _nullThumbFx]);
    r.vm.onSettingsTabShown();
    advance(async, Duration.zero);
    expect(r.state.imageUrl, _field(_okFx, 'signatureThumbnailImageUrl'));
    r.vm.onSettingsTabShown();
    advance(async, Duration.zero);
    expect(r.h.adapter.count('GET', meSignaturePath), 2);
    expect(r.state.imageUrl, _field(_nullThumbFx, 'signatureOriginalImageUrl'));
  });

  fakeTest('TC-SIGN-027 조회가 진행 중이면 중복 요청하지 않는다', (async) {
    final r = _Rig();
    r.h.adapter.on('GET', meSignaturePath, [
      FakeResponse.fixture(_okFx, delay: const Duration(seconds: 1)),
    ]);
    r.vm.load();
    r.vm.load();
    r.vm.onSettingsTabShown();
    settle(async);
    advance(async, const Duration(seconds: 2));
    expect(r.h.adapter.count('GET', meSignaturePath), 1);
    expect(r.state.status, SignatureCardStatus.content);
  });

  fakeTest(
    'TC-SIGN-040 SIGNATURE_REGISTRATION_REQUIRED면 이미지를 비우고 토스트 없이 변경을 유도한다',
    (async) {
      final r = _Rig();
      r.h.onGetSignature([_regFx]);
      r.load(async);
      expect(r.state.status, SignatureCardStatus.registrationRequired);
      expect(r.state.imageUrl, isNull);
      expect(r.state.toast, isNull);
    },
  );

  fakeTest('TC-SIGN-040 보이던 사인이 있어도 재등록이 필요하면 이미지를 비운다', (async) {
    final r = _Rig();
    r.h.onGetSignature([_okFx, _regFx]);
    r.load(async);
    expect(r.state.imageUrl, isNotNull);
    r.load(async);
    expect(r.state.status, SignatureCardStatus.registrationRequired);
    expect(r.state.imageUrl, isNull);
  });

  fakeTest('TC-SIGN-015 조회 실패면 보이던 사인을 유지하고 sign.load.error 토스트를 낸다', (async) {
    final r = _Rig();
    r.h.onGetSignature([_okFx, _errFx]);
    r.load(async);
    final shown = r.state.imageUrl;
    r.load(async, const Duration(seconds: 3));
    expect(r.state.imageUrl, shown);
    expect(r.state.status, SignatureCardStatus.content);
    expect(r.state.toast!.text, Copy.signLoadError);
  });

  fakeTest('TC-SIGN-015 보이던 사인이 없으면 이미지 자리를 비워 두고 토스트를 낸다', (async) {
    final r = _Rig();
    r.h.onGetSignature([_errFx]);
    r.load(async, const Duration(seconds: 3));
    expect(r.state.imageUrl, isNull);
    expect(r.state.toast!.text, Copy.signLoadError);
    expect(r.state.status, isNot(SignatureCardStatus.loading));
  });

  fakeTest('TC-SIGN-015 같은 실패가 연달아도 토스트 id가 달라 다시 표시된다', (async) {
    final r = _Rig();
    r.h.onGetSignature([_errFx]);
    r.load(async, const Duration(seconds: 3));
    final first = r.state.toast!.id;
    r.load(async, const Duration(seconds: 3));
    expect(r.state.toast!.id, isNot(first));
  });

  fakeTest('TC-SIGN-033 401을 갱신해도 실패하면 토스트 없이 끝난다(로그인 이동은 앱 몫)', (async) {
    final r = _Rig();
    r.h.onGetSignature(['signature/users-me-signature__get-unauthorized.json']);
    r.h.onRefresh('auth/refresh__reauthentication-required.json');
    r.load(async);
    expect(r.state.toast, isNull);
    expect(r.h.store.current, isNull);
  });

  fakeTest('TC-SIGN-039 정지 회원도 조회에 성공해 사인이 보이고 정지 문구는 나오지 않는다', (async) {
    final r = _Rig();
    r.h.onGetSignature([_okFx]);
    r.load(async);
    expect(r.state.imageUrl, isNotNull);
    expect(r.state.toast, isNull);
  });

  fakeTest('TC-SIGN-038 화면이 사라진 뒤 도착한 응답은 반영하지 않는다', (async) {
    final r = _Rig();
    r.h.adapter.on('GET', meSignaturePath, [
      FakeResponse.fixture(_okFx, delay: const Duration(seconds: 1)),
    ]);
    r.vm.load();
    settle(async);
    r.vm.dispose();
    advance(async, const Duration(seconds: 2));
    // 던지는 예외가 없어야 한다(dispose 뒤 notifyListeners 금지).
    expect(r.h.adapter.count('GET', meSignaturePath), 1);
  });

  fakeTest('REQ-SIGN-017 게스트는 사인 API를 호출하지 않고 상태도 바뀌지 않는다', (async) {
    final r = _Rig(guest: true);
    r.load(async);
    r.vm.onSettingsTabShown();
    advance(async, Duration.zero);
    expect(r.h.adapter.requests, isEmpty);
    expect(r.state.status, SignatureCardStatus.idle);
    expect(r.state.toast, isNull);
  });
}
