import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/navigation/domain/main_shell_view_model.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

/// 업로드 진입 게이트(UPL 1~10). 게이트 자체는 navigation의 `UploadEntryGate`를 재사용하므로
/// 하단 "+" 버튼 -> MainShellViewModel -> UploadEntryGate 경로로 검증한다.
const _wait = Duration(seconds: 5);

void _press(HomeRig r, FakeAsync async) {
  r.shell.onUploadPressed();
  advance(async, _wait);
}

void main() {
  fakeTest('TC-UPL-001 게스트의 + 버튼은 토스트만 띄우고 네트워크 요청이 0건이다', (async) {
    final r = HomeRig(guest: true);
    r.shell.onUploadPressed();
    advance(async, _wait);
    expect(r.toast.messages, [Copy.uploadGateLoginRequired]);
    expect(r.api.totalCalls, 0);
    expect(r.shellEvents.whereType<NavigateToUpload>(), isEmpty);
  });

  fakeTest('TC-UPL-002 미작성이면 GET /posts/today 1회 뒤 응답 topicDate로 업로드 화면이 열린다', (
    async,
  ) {
    final r = HomeRig();
    r.api.today([fx('upload/posts-today__not-posted.json')]);
    _press(r, async);
    expect(r.api.todayCalls, 1);
    expect(
      r.shellEvents.whereType<NavigateToUpload>().single.topicDate,
      const KstDate(2026, 10, 27),
    );
    expect(r.toast.messages, isEmpty);
  });

  fakeTest(
    'TC-UPL-003 VALIDATING·PENDING·APPROVED 모두 이미 작성했어요 토스트이고 화면이 열리지 않는다',
    (async) {
      for (final name in [
        'home/posts-today__posted-validating.json',
        'home/posts-today__posted-pending.json',
        'home/posts-today__posted-approved.json',
      ]) {
        final r = HomeRig();
        r.api.today([fx(name)]);
        _press(r, async);
        expect(r.toast.messages, [Copy.uploadGateAlreadyPosted], reason: name);
        expect(r.shellEvents.whereType<NavigateToUpload>(), isEmpty);
      }
    },
  );

  fakeTest('TC-UPL-004 /posts/today 404는 참여할 수 있는 주제가 없어요 토스트이다', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__404-no-open-topic.json')]);
    _press(r, async);
    expect(r.toast.messages, [Copy.uploadGateNoOpenTopic]);
    expect(r.shellEvents.whereType<NavigateToUpload>(), isEmpty);
  });

  fakeTest('TC-UPL-005 정지 회원 403은 정지 문구이고 같은 요청을 다시 보내지 않는다', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__403-banned.json')]);
    _press(r, async);
    expect(r.toast.messages, [Copy.uploadGateBanned]);
    expect(r.api.todayCalls, 1);
  });

  fakeTest('TC-UPL-006 401 UNAUTHORIZED는 refresh 후 1회 재전송하고 통과한다', (async) {
    final r = HomeRig();
    r.api.refreshSucceeds();
    r.api.today([
      fx('home/posts-today__401-unauthorized.json'),
      fx('upload/posts-today__not-posted.json'),
    ]);
    _press(r, async);
    expect(r.api.todayCalls, 2);
    expect(r.http.adapter.count('POST', '$v1/auth/refresh'), 1);
    expect(r.shellEvents.whereType<NavigateToUpload>(), hasLength(1));
  });

  fakeTest('TC-UPL-006 REAUTHENTICATION_REQUIRED면 로그인 화면으로 보낸다', (async) {
    final r = HomeRig();
    r.http.adapter.on('POST', '$v1/auth/refresh', [
      FakeResponse.fixture('auth/refresh__reauthentication-required.json'),
    ]);
    r.api.today([fx('home/posts-today__401-unauthorized.json')]);
    _press(r, async);
    expect(r.shellEvents.whereType<NavigateToLogin>(), hasLength(1));
    expect(r.shellEvents.whereType<NavigateToUpload>(), isEmpty);
  });

  fakeTest('TC-UPL-007 서버 오류·연결 실패는 확인하지 못했어요 토스트이고 화면이 열리지 않는다', (async) {
    final failures = <List<FakeResponse>>[
      failing('home/posts-today__500-server-error.json'),
      List.filled(3, const FakeResponse.fault(FakeFault.disconnect)),
    ];
    for (final responses in failures) {
      final r = HomeRig();
      r.api.today(responses);
      _press(r, async);
      expect(r.toast.messages, [Copy.uploadGateCheckFailed]);
      expect(r.shellEvents.whereType<NavigateToUpload>(), isEmpty);
    }
  });

  fakeTest('TC-UPL-008 계약 위반 응답은 일반 실패 문구로 처리한다', (async) {
    for (final name in [
      'upload/posts-today__invalid-not-posted-with-post.json',
      'home/posts-today__unknown-status.json',
    ]) {
      final r = HomeRig();
      r.api.today([fx(name)]);
      _press(r, async);
      expect(r.toast.messages, [Copy.uploadGateCheckFailed], reason: name);
      expect(r.shellEvents.whereType<NavigateToUpload>(), isEmpty);
    }
  });

  fakeTest('TC-UPL-008 계약 위반은 저장소에서 invalidResponse로 던져진다', (async) {
    final r = HomeRig();
    r.api.today([fx('upload/posts-today__invalid-not-posted-with-post.json')]);
    final p = start(async, r.fakes.home.today());
    advance(async, _wait);
    expect(p.error, isA<ApiError>());
    expect((p.error! as ApiError).isInvalidResponse, isTrue);
  });

  fakeTest('TC-UPL-009 확인 중 + 버튼을 연타해도 GET /posts/today는 1회만 나간다', (async) {
    final r = HomeRig();
    r.api.today([
      fx(
        'upload/posts-today__not-posted.json',
        delay: const Duration(seconds: 2),
      ),
    ]);
    for (var i = 0; i < 5; i++) {
      r.shell.onUploadPressed();
    }
    advance(async, _wait);
    expect(r.api.todayCalls, 1);
    expect(r.shellEvents.whereType<NavigateToUpload>(), hasLength(1));
  });

  fakeTest('TC-UPL-010 확인 중 화면을 정리하면 요청을 취소하고 업로드 화면이 열리지 않는다', (async) {
    final r = HomeRig();
    r.api.today([
      fx(
        'upload/posts-today__not-posted.json',
        delay: const Duration(seconds: 2),
      ),
    ]);
    r.shell.onUploadPressed();
    advance(async, const Duration(milliseconds: 500));
    r.shell.dispose();
    advance(async, _wait);
    expect(r.shellEvents.whereType<NavigateToUpload>(), isEmpty);
    expect(r.toast.messages, isEmpty);
    expect(r.api.todayCalls, lessThanOrEqualTo(1));
  });
}
