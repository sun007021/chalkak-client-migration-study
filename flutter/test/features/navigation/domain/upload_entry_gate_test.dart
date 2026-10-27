import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/navigation/domain/upload_entry_gate.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

void main() {
  UploadGateResult enter(HomeRig r, dynamic async) {
    final p = start(async, r.gate.enter());
    advance(async, const Duration(seconds: 3)); // GET 재시도 0.5초·1초 포함
    if (!p.done) fail('게이트가 끝나지 않았다');
    return p.value!;
  }

  fakeTest('TC-NAV-005 확인 통과: GET /posts/today 1회 뒤 응답 topicDate로 Allowed', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__not-posted.json')]);
    final result = enter(r, async);
    expect(result, isA<UploadGateAllowed>());
    expect((result as UploadGateAllowed).topicDate, KstDate(2026, 10, 27));
    expect(r.api.todayCalls, 1);
  });

  fakeTest('D-14 통과한 topicDate는 응답 값 그대로다(자정을 지나도 클라이언트 시계로 바꾸지 않는다)', (async) {
    final r = HomeRig();
    // 응답 날짜 10/27, 클라이언트 시계는 KST 10/28 01:00
    r.api.today([fx('time/posts-today__cross-midnight.json')]);
    async.elapse(const Duration(hours: 13));
    final result = enter(r, async);
    expect((result as UploadGateAllowed).topicDate, KstDate(2026, 10, 27));
  });

  fakeTest('D-14 이미 이 주제에 게시했으면 Blocked(이미 작성했어요)이다', (async) {
    for (final name in [
      'home/posts-today__posted-approved.json',
      'home/posts-today__posted-pending.json',
      'home/posts-today__posted-validating.json',
    ]) {
      final r = HomeRig();
      r.api.today([fx(name)]);
      final result = enter(r, async);
      expect(result, isA<UploadGateBlocked>(), reason: name);
      expect((result as UploadGateBlocked).message, Copy.uploadGateAlreadyPosted);
    }
  });

  fakeTest('D-14 404이면 Blocked(지금 참여할 수 있는 주제가 없어요)', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__404-no-open-topic.json')]);
    final result = enter(r, async) as UploadGateBlocked;
    expect(result.message, Copy.uploadGateNoTopic);
    expect(r.api.todayCalls, 1, reason: '404는 재시도하지 않는다');
  });

  fakeTest('TC-HOME-008 D-08 403(정지)이면 Blocked(이용이 정지되어…)이고 재시도하지 않는다', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__403-banned.json')]);
    final result = enter(r, async) as UploadGateBlocked;
    expect(result.message, Copy.uploadGateBanned);
    expect(r.api.todayCalls, 1);
  });

  fakeTest('D-14 401은 갱신 1회 뒤 원 요청을 다시 보내 통과하면 Allowed', (async) {
    final r = HomeRig();
    r.api.today([
      fx('home/posts-today__401-unauthorized.json'),
      fx('home/posts-today__not-posted.json'),
    ]);
    r.api.refreshSucceeds();
    final result = enter(r, async);
    expect(result, isA<UploadGateAllowed>());
    expect(r.api.todayCalls, 2);
    expect(r.http.adapter.count('POST', '$v1/auth/refresh'), 1);
  });

  fakeTest('TC-NAV-036 D-14 갱신 후에도 401이면 LoginRequired', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__401-unauthorized.json')]);
    r.http.adapter.on('POST', '$v1/auth/refresh', [
      FakeResponse.fixture('auth/refresh__reauthentication-required.json'),
    ]);
    expect(enter(r, async), isA<UploadGateLoginRequired>());
  });

  fakeTest('D-14 그 외 실패(5xx)는 Blocked(작성 여부를 확인하지 못했어요)', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__500-server-error.json')]);
    final result = enter(r, async) as UploadGateBlocked;
    expect(result.message, Copy.uploadGateCheckFailed);
  });

  fakeTest('D-14 연결 실패(타임아웃)도 Blocked(작성 여부를 확인하지 못했어요)', (async) {
    final r = HomeRig();
    r.api.today([const FakeResponse.fault(FakeFault.disconnect)]);
    final result = enter(r, async) as UploadGateBlocked;
    expect(result.message, Copy.uploadGateCheckFailed);
  });

  fakeTest('TC-HOME-017 REQ-HOME-017 isPosted=false인데 postId가 있는 잘못된 응답은 확인 실패로 본다', (async) {
    final r = HomeRig();
    r.api.today([fx('upload/posts-today__invalid-not-posted-with-post.json')]);
    final result = enter(r, async) as UploadGateBlocked;
    expect(result.message, Copy.uploadGateCheckFailed);
  });
}
