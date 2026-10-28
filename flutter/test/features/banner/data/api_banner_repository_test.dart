import 'package:chalkak/core/network/api_error.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

void main() {
  Future<Object?> errorOf(Future<Object?> f) async {
    try {
      await f;
    } on Object catch (e) {
      return e;
    }
    return null;
  }

  fakeTest(
    'TC-BANR-001 GET /banners?page=1&pageSize=10을 Authorization 없이 부르고 순서대로 매핑한다',
    (async) {
      final r = HomeRig();
      r.api.banners(1, [fx('banner/banners__page1-10.json')]);
      final page = resolve(async, r.fakes.banners.fetchPage(1));
      final req = r.http.adapter.where('GET', '$v1/banners').single;
      expect(req.uri.queryParameters, {'page': '1', 'pageSize': '10'});
      expect(req.hasAuthorization, isFalse, reason: '로그인 상태에서도 토큰을 붙이지 않는다');
      expect(page.banners, hasLength(10));
      expect(page.hasNext, isTrue);
      final first = page.banners.first;
      expect(first.id, '44444444-4444-4444-8444-444444444401');
      expect(first.title, '이슈 1');
      expect(first.subtitle, '찰칵 소식 1');
      expect(first.webViewUrl, Uri.parse('https://web.example.test/issues/1'));
      expect(first.thumbnailUrl, isNotNull);
      expect(first.createdAt, DateTime.utc(2026, 10, 27, 1));
      expect(page.banners.map((b) => b.id).toList(), [
        for (var i = 1; i <= 10; i++)
          '44444444-4444-4444-8444-4444444444${i.toString().padLeft(2, '0')}',
      ]);
    },
  );

  fakeTest('TC-BANR-001 게스트도 같은 요청을 Authorization 없이 보낸다', (async) {
    final r = HomeRig(guest: true);
    resolve(async, r.fakes.banners.fetchPage(1));
    expect(r.http.adapter.requests.single.hasAuthorization, isFalse);
  });

  fakeTest('TC-BANR-002 액세스 토큰이 만료된 회원도 토큰 없이 200을 받고 갱신하지 않는다', (async) {
    final r = HomeRig(
      session: sessionAt(accessLeft: const Duration(minutes: -1)),
    );
    final page = resolve(async, r.fakes.banners.fetchPage(1));
    expect(page.banners, isNotEmpty);
    expect(r.http.adapter.count('POST', '$v1/auth/refresh'), 0);
  });

  fakeTest('TC-BANR-002 서버가 401을 줘도 refresh를 시도하지 않고 오류로 돌려준다', (async) {
    final r = HomeRig();
    r.api.banners(1, [fx('banner/banners__401-unauthorized.json')]);
    final p = start(async, errorOf(r.fakes.banners.fetchPage(1)));
    advance(async, const Duration(seconds: 3));
    expect((p.value as ApiError).status, 401);
    expect(r.http.adapter.count('POST', '$v1/auth/refresh'), 0);
  });

  fakeTest('TC-BANR-003 page=2 쿼리를 그대로 보내고 빈 페이지·hasNext=false를 오류 없이 처리한다', (
    async,
  ) {
    final r = HomeRig();
    final page2 = resolve(async, r.fakes.banners.fetchPage(2));
    expect(
      r.http.adapter.where('GET', '$v1/banners').single.uri.queryParameters,
      {'page': '2', 'pageSize': '10'},
    );
    expect(page2.hasNext, isFalse);

    r.api.banners(1, [fx('banner/banners__empty.json')]);
    final empty = resolve(async, r.fakes.banners.fetchPage(1));
    expect(empty.banners, isEmpty);
    expect(empty.hasNext, isFalse);
  });

  fakeTest('TC-BANR-004 hasNext가 없는 응답은 마지막 페이지다', (async) {
    final r = HomeRig();
    r.api.banners(1, [fx('banner/banners__no-has-next.json')]);
    final page = resolve(async, r.fakes.banners.fetchPage(1));
    expect(page.hasNext, isFalse);
    expect(page.banners, hasLength(3));
  });

  fakeTest('TC-BANR-005 400은 재시도 없이 오류, 5xx는 0.5초·1초 간격 2회 재시도 뒤 오류', (async) {
    final r = HomeRig();
    r.api.banners(1, [fx('banner/banners__400-bad-query.json')]);
    var p = start(async, errorOf(r.fakes.banners.fetchPage(1)));
    advance(async, const Duration(seconds: 3));
    expect((p.value as ApiError).status, 400);
    expect(r.api.bannerCalls, 1);
    expect(r.http.adapter.count('POST', '$v1/auth/refresh'), 0);

    r.api.banners(1, [fx('banner/banners__500-server-error.json')]);
    p = start(async, errorOf(r.fakes.banners.fetchPage(1)));
    advance(async, const Duration(seconds: 3));
    expect((p.value as ApiError).status, 500);
    expect(r.api.bannerCalls, 1 + 3);
  });

  fakeTest('TC-BANR-006 깨진 JSON과 https가 아닌 webViewUrl은 응답 전체가 잘못된 응답이다', (
    async,
  ) {
    for (final name in [
      'banner/banners__malformed.json',
      'banner/banners__insecure-url.json',
    ]) {
      final r = HomeRig();
      r.api.banners(1, [fx(name)]);
      final p = start(async, errorOf(r.fakes.banners.fetchPage(1)));
      advance(async, const Duration(seconds: 3));
      expect((p.value as ApiError).isInvalidResponse, isTrue, reason: name);
    }
  });

  fakeTest('TC-BANR-007 thumbnailUrl만 잘못된 배너는 유지하고 썸네일은 null이다', (async) {
    final r = HomeRig();
    r.api.banners(1, [fx('banner/banners__bad-thumbnail.json')]);
    final page = resolve(async, r.fakes.banners.fetchPage(1));
    expect(page.banners, hasLength(3));
    expect(page.banners[0].thumbnailUrl, isNotNull);
    expect(page.banners[1].thumbnailUrl, isNull);
    expect(page.banners[2].thumbnailUrl, isNotNull);
  });
}
