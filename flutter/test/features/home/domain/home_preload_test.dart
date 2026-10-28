import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/home/domain/home_preload.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

const _today = KstDate(2026, 10, 27);

ApiHomePreloader _preloader(HomeRig r) => ApiHomePreloader(
  home: r.fakes.home,
  today: r.fakes.home,
  banners: r.fakes.banners,
  cache: r.cache,
);

void main() {
  fakeTest('TC-BOOT-013 게스트 프리로드는 공개 데이터(주제·인기·배너)만 받고 인증 호출은 0건이다', (async) {
    final r = HomeRig(guest: true);
    resolve(async, _preloader(r).preload(guest: true));
    expect(r.api.authenticatedCalls, 0);
    expect(r.api.topicCalls, greaterThanOrEqualTo(1));
    expect(r.api.bannerCalls, 1);
    expect(r.http.adapter.requests.any((q) => q.hasAuthorization), isFalse);
    final snap = r.cache.take(guest: true, today: _today)!;
    expect(snap.hero, isNull);
    expect(snap.topic?.title, '가을 하늘');
    expect(snap.popular, isNotEmpty);
    expect(snap.banners?.banners, hasLength(10));
  });

  fakeTest('로그인 프리로드는 /posts/today 결과도 캐시에 둔다', (async) {
    final r = HomeRig();
    resolve(async, _preloader(r).preload(guest: false));
    final snap = r.cache.take(guest: false, today: _today)!;
    expect(snap.hero?.isPosted, isTrue);
    expect(r.api.todayCalls, 1);
  });

  fakeTest('스냅샷은 한 번 꺼내면 비워지고 날짜·게스트 여부가 다르면 꺼내지 못한다', (async) {
    final r = HomeRig();
    resolve(async, _preloader(r).preload(guest: false));
    expect(r.cache.take(guest: true, today: _today), isNull);
    expect(
      r.cache.take(guest: false, today: const KstDate(2026, 10, 28)),
      isNull,
    );
    expect(r.cache.take(guest: false, today: _today), isNotNull);
    expect(r.cache.take(guest: false, today: _today), isNull, reason: '재사용 금지');
  });

  fakeTest('TC-BOOT-012 일부 섹션이 실패해도 성공한 섹션은 캐시에 둔다', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__500-server-error.json')]);
    final p = start(async, _preloader(r).preload(guest: false));
    advance(async, const Duration(seconds: 5));
    expect(p.error, isNull);
    final snap = r.cache.take(guest: false, today: _today)!;
    expect(snap.hero, isNull);
    expect(snap.banners, isNotNull);
  });

  fakeTest('TC-BOOT-012 전부 실패하면 던진다(부트가 즉시 해제하고 홈이 오류 상태를 그린다)', (async) {
    final r = HomeRig();
    const offline = FakeResponse.fault(FakeFault.disconnect);
    r.api.topic('2026-10-27', [offline]);
    r.api.today([offline]);
    r.api.banners(1, [offline]);
    final p = start(async, _preloader(r).preload(guest: false));
    advance(async, const Duration(seconds: 10));
    expect(p.error, isNotNull);
    expect(r.cache.take(guest: false, today: _today), isNull);
  });

  fakeTest('TC-HOME-044 로그아웃(clearAll) 후에는 비워지고 늦게 도착한 이전 사용자의 프리로드는 버린다', (
    async,
  ) {
    final r = HomeRig();
    r.api.standard(delay: const Duration(seconds: 3));
    final p = start(async, _preloader(r).preload(guest: false));
    r.cache.clearAll();
    advance(async, const Duration(seconds: 10));
    expect(p.done, isTrue);
    expect(r.cache.take(guest: false, today: _today), isNull);

    // resolve는 가상 시간을 흘리지 않으므로 지연 없는 응답으로 다시 건다.
    r.api.standard();
    resolve(async, _preloader(r).preload(guest: false));
    r.cache.clearAll();
    expect(r.cache.take(guest: false, today: _today), isNull);
  });
}
