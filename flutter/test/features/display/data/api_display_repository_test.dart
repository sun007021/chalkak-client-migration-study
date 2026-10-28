import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/display/data/api_display_repository.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/net_harness.dart';

const _topicsPath = '$v1/topics';
const _postsPath = '$v1/posts';

ApiDisplayRepository _repo(NetHarness h) =>
    ApiDisplayRepository(client: h.client);

ApiError _err(Probe<Object?> p) => p.error! as ApiError;

Probe<PostPage> _posts(
  NetHarness h, {
  String date = '2026-10-27',
  DisplaySort sort = DisplaySort.recent,
  int page = 1,
  String? seed,
}) => Probe(
  _repo(
    h,
  ).fetchPosts(topicDate: day(date), sort: sort, page: page, randomSeed: seed),
);

Probe<DisplayTopic> _topic(NetHarness h, [String date = '2026-10-27']) =>
    Probe(_repo(h).fetchTopic(day(date)));

Map<String, String> _q(NetHarness h) =>
    h.adapter.requests.last.uri.queryParameters;

void main() {
  group('GET /topics', () {
    netTest('TC-DISP-002 date 쿼리로 부르고 id·title·topicDate·phase를 읽는다', (h, a) {
      h.adapter.on('GET', _topicsPath, [FakeResponse.fixture(topicOpenFx)]);
      final r = _topic(h);
      settle(a);
      expect(_q(h), {'date': '2026-10-27'});
      expect(r.value!.title, '가을 하늘');
      expect(r.value!.topicDate, today);
      expect(r.value!.phase, 'OPEN');
    }, session: sessionAt());

    netTest('TC-DISP-009 phase가 BEFORE_OPEN이어도 오류가 아니다', (h, a) {
      h.adapter.on('GET', _topicsPath, [
        FakeResponse.fixture('display/topics__before-open.json'),
      ]);
      final r = _topic(h, '2026-10-28');
      settle(a);
      expect(r.value!.phase, 'BEFORE_OPEN');
    }, session: sessionAt());

    netTest('TC-DISP-002 응답 topicDate가 요청 날짜와 다르면 잘못된 응답이다', (h, a) {
      h.adapter.on('GET', _topicsPath, [FakeResponse.fixture(topicOpenFx)]);
      final r = _topic(h, '2026-10-26');
      settle(a);
      expect(_err(r).isInvalidResponse, isTrue);
    }, session: sessionAt());

    netTest('TC-DISP-006 404는 status 404 오류로 전달된다', (h, a) {
      h.adapter.on('GET', _topicsPath, [FakeResponse.fixture(topic404Fx)]);
      final r = _topic(h);
      advance(a, const Duration(seconds: 5));
      expect(_err(r).status, 404);
      expect(h.adapter.requests, hasLength(1));
    }, session: sessionAt());

    netTest('TC-DISP-033 5xx는 재시도 뒤 server 오류, 연결 실패는 network 오류', (h, a) {
      h.adapter.on('GET', _topicsPath, [FakeResponse.fixture(topic500Fx)]);
      final r = _topic(h);
      advance(a, const Duration(seconds: 5));
      expect(_err(r).status, 500);
      expect(h.adapter.requests, hasLength(3));
    }, session: sessionAt());
  });

  group('GET /posts 요청', () {
    netTest(
      'TC-DISP-002 topicDate, sort=recent, page=1, pageSize=20을 보내고 randomSeed는 없다',
      (h, a) {
        h.adapter.on('GET', _postsPath, [FakeResponse.fixture(recentP1Fx)]);
        _posts(h);
        settle(a);
        expect(_q(h), {
          'topicDate': '2026-10-27',
          'sort': 'recent',
          'page': '1',
          'pageSize': '20',
        });
      },
      session: sessionAt(),
    );

    netTest('TC-DISP-003 sort는 소문자 recent·popular·random이다', (h, a) {
      h.adapter.on('GET', _postsPath, [FakeResponse.fixture(recentP1Fx)]);
      for (final s in DisplaySort.values) {
        _posts(h, sort: s);
        settle(a);
      }
      expect(
        [for (final r in h.adapter.requests) r.uri.queryParameters['sort']],
        ['recent', 'popular', 'random'],
      );
    }, session: sessionAt());

    netTest('TC-DISP-016 랜덤 2페이지는 page=2와 저장한 randomSeed를 보낸다', (h, a) {
      h.adapter.on('GET', _postsPath, [FakeResponse.fixture(randomP2Fx)]);
      _posts(h, sort: DisplaySort.random, page: 2, seed: 'seed_abc123');
      settle(a);
      expect(_q(h)['page'], '2');
      expect(_q(h)['randomSeed'], 'seed_abc123');
    }, session: sessionAt());

    netTest('TC-DISP-003 randomSeed는 [A-Za-z0-9_-]{1,64}일 때만 만든다', (h, a) {
      h.adapter.on('GET', _postsPath, [FakeResponse.fixture(randomP2Fx)]);
      final ok64 = 'a' * 64;
      for (final seed in ['A-b_9', ok64]) {
        _posts(h, sort: DisplaySort.random, page: 2, seed: seed);
        settle(a);
        expect(_q(h)['randomSeed'], seed);
      }
      final before = h.adapter.requests.length;
      for (final bad in ['', 'a' * 65, 'ab!c', 'a b']) {
        final r = Probe<Object?>(
          Future.sync(
            () => _repo(h).fetchPosts(
              topicDate: today,
              sort: DisplaySort.random,
              page: 2,
              randomSeed: bad,
            ),
          ),
        );
        settle(a);
        expect(r.error, isA<ArgumentError>(), reason: '"$bad"');
      }
      expect(h.adapter.requests.length, before);
    }, session: sessionAt());

    netTest('TC-DISP-003 page는 1 이상이다(0은 요청 없이 ArgumentError)', (h, a) {
      final r = Probe<Object?>(
        Future.sync(
          () => _repo(h)
              .fetchPosts(topicDate: today, sort: DisplaySort.recent, page: 0),
        ),
      );
      settle(a);
      expect(r.error, isA<ArgumentError>());
      expect(h.adapter.requests, isEmpty);
    }, session: sessionAt());
  });

  group('GET /posts 인증', () {
    netTest('TC-DISP-004 로그인 상태면 Authorization을 붙인다', (h, a) {
      h.adapter.on('GET', _postsPath, [FakeResponse.fixture(recentP1Fx)]);
      _posts(h);
      settle(a);
      expect(h.adapter.requests.single.hasAuthorization, isTrue);
    }, session: sessionAt());

    netTest(
      'TC-DISP-004 게스트는 Authorization 없이 부르고 isLiked/isMine=false를 그대로 쓴다',
      (h, a) {
        h.adapter.on('GET', _postsPath, [FakeResponse.fixture(guestP1Fx)]);
        final r = _posts(h);
        settle(a);
        expect(h.adapter.requests.single.hasAuthorization, isFalse);
        expect(r.value!.posts.every((c) => !c.isLiked && !c.isMine), isTrue);
      },
      session: sessionGuest(),
    );

    netTest('TC-DISP-053 세션이 없어도 토큰 없이 부른다', (h, a) {
      h.adapter.on('GET', _postsPath, [FakeResponse.fixture(guestP1Fx)]);
      final r = _posts(h);
      settle(a);
      expect(r.succeeded, isTrue);
      expect(h.adapter.requests.single.hasAuthorization, isFalse);
    });

    netTest('TC-DISP-051 만료 토큰으로 401이면 refresh 뒤 한 번 재전송한다', (h, a) {
      h.adapter.on('GET', _postsPath, [
        FakeResponse.fixture('display/posts-list__401-unauthorized.json'),
        FakeResponse.fixture(recentP1Fx),
      ]);
      h.adapter.on('POST', '$v1/auth/refresh', [
        FakeResponse.fixture('auth/refresh__success.json'),
      ]);
      final r = _posts(h);
      advance(a, const Duration(seconds: 1));
      expect(r.succeeded, isTrue);
      expect(h.refreshCalls, 1);
      final gets = h.adapter.where('GET', _postsPath).toList();
      expect(gets, hasLength(2));
      expect(gets[1].header('authorization'), 'Bearer fixture-access-token-2');
    }, session: sessionAt());
  });

  group('GET /posts 응답', () {
    netTest(
      'TC-DISP-002 사진 4종 URL·likeCount·isLiked·isMine·title·페이지 정보를 매핑한다',
      (h, a) {
        h.adapter.on('GET', _postsPath, [FakeResponse.fixture(recentP1Fx)]);
        final r = _posts(h);
        settle(a);
        final page = r.value!;
        expect(page.currentPage, 1);
        expect(page.pageSize, 20);
        expect(page.hasNext, isTrue);
        expect(page.randomSeed, isNull);
        expect(page.posts, hasLength(20));
        final c = page.posts.first;
        expect(c.id, postIdOf(2));
        expect(c.authorId, otherUserId);
        expect(c.originalImageUrl, endsWith('/${postIdOf(2)}/original.webp'));
        expect(c.thumbnailImageUrl, endsWith('/${postIdOf(2)}/thumbnail.webp'));
        expect(c.signatureOriginalImageUrl, endsWith('original.png'));
        expect(c.signatureThumbnailImageUrl, endsWith('thumbnail.png'));
        expect(c.title, '은행잎');
        expect(c.likeCount, 38);
        expect(c.isLiked, isFalse);
        expect(c.isMine, isFalse);
        expect(page.posts.where((p) => p.isMine).map((p) => p.id), [myPostId]);
        expect(page.posts[2].title, isNull);
      },
      session: sessionAt(),
    );

    netTest('TC-DISP-002 thumbnailImageUrl이 null이면 원본을 쓴다', (h, a) {
      h.adapter.on('GET', _postsPath, [
        FakeResponse.json(200, {
          'currentPage': 1,
          'pageSize': 20,
          'hasNext': false,
          'randomSeed': null,
          'posts': [
            {
              'id': postIdOf(2),
              'authorId': otherUserId,
              'originalImageUrl': 'https://cdn.example.test/o.webp',
              'thumbnailImageUrl': null,
              'signatureOriginalImageUrl': 'https://cdn.example.test/s.png',
              'signatureThumbnailImageUrl': null,
              'title': null,
              'likeCount': 0,
              'isLiked': false,
              'isMine': false,
            },
          ],
        }),
      ]);
      final r = _posts(h);
      settle(a);
      expect(
        r.value!.posts.single.thumbnailImageUrl,
        'https://cdn.example.test/o.webp',
      );
    }, session: sessionAt());

    netTest('TC-DISP-015 랜덤 첫 페이지 응답의 randomSeed를 읽는다', (h, a) {
      h.adapter.on('GET', _postsPath, [FakeResponse.fixture(randomP1Fx)]);
      final r = _posts(h, sort: DisplaySort.random);
      settle(a);
      expect(r.value!.randomSeed, 'seed_abc123');
      expect(_q(h).containsKey('randomSeed'), isFalse);
    }, session: sessionAt());

    netTest('TC-DISP-023 범위 밖 page=99의 빈 posts·hasNext=false는 오류가 아니다', (h, a) {
      h.adapter.on('GET', _postsPath, [FakeResponse.fixture(page99Fx)]);
      final r = _posts(h, page: 99);
      settle(a);
      expect(r.succeeded, isTrue);
      expect(r.value!.posts, isEmpty);
      expect(r.value!.hasNext, isFalse);
    }, session: sessionAt());

    netTest('TC-DISP-007 404 BUSINESS_ERROR는 status 404 오류로 전달된다', (h, a) {
      h.adapter.on('GET', _postsPath, [FakeResponse.fixture(posts404Fx)]);
      final r = _posts(h);
      advance(a, const Duration(seconds: 5));
      expect(_err(r).status, 404);
      expect(h.adapter.requests, hasLength(1));
    }, session: sessionAt());

    netTest('TC-DISP-008 400 BUSINESS_ERROR는 재시도 없이 status 400 오류다', (h, a) {
      for (final fx in [posts400FutureFx, posts400QueryFx]) {
        final h2 = NetHarness(session: sessionAt());
        h2.adapter.on('GET', _postsPath, [FakeResponse.fixture(fx)]);
        final r = _posts(h2);
        advance(a, const Duration(seconds: 5));
        expect(_err(r).status, 400, reason: fx);
        expect(h2.adapter.requests, hasLength(1));
      }
    }, session: sessionAt());

    netTest('TC-DISP-034 필수 필드가 없거나 likeCount가 음수인 항목이 있으면 응답 전체가 잘못된 응답이다', (
      h,
      a,
    ) {
      Map<String, Object?> item(Map<String, Object?> patch) => {
        'id': postIdOf(2),
        'authorId': otherUserId,
        'originalImageUrl': 'https://cdn.example.test/o.webp',
        'thumbnailImageUrl': 'https://cdn.example.test/t.webp',
        'signatureOriginalImageUrl': 'https://cdn.example.test/s.png',
        'signatureThumbnailImageUrl': null,
        'title': null,
        'likeCount': 1,
        'isLiked': false,
        'isMine': false,
        ...patch,
      };
      final bad = <Map<String, Object?>>[
        item({'likeCount': -1}),
        item({'id': null}),
        item({'originalImageUrl': null}),
        item({'likeCount': '1'}),
      ];
      for (final b in bad) {
        final h2 = NetHarness(session: sessionAt());
        h2.adapter.on('GET', _postsPath, [
          FakeResponse.json(200, {
            'currentPage': 1,
            'pageSize': 20,
            'hasNext': false,
            'randomSeed': null,
            'posts': [item({}), b],
          }),
        ]);
        final r = _posts(h2);
        settle(a);
        expect(_err(r).isInvalidResponse, isTrue, reason: '$b');
      }
    }, session: sessionAt());

    netTest('TC-DISP-052 503 Retry-After(1초)만큼 기다린 뒤 재시도한다', (h, a) {
      h.adapter.on('GET', _postsPath, [
        FakeResponse.fixture('display/posts-list__503-retry-after.json'),
        FakeResponse.fixture(recentP1Fx),
      ]);
      final r = _posts(h);
      advance(a, const Duration(milliseconds: 999));
      expect(h.adapter.requests, hasLength(1));
      advance(a, const Duration(milliseconds: 1));
      expect(h.adapter.requests, hasLength(2));
      expect(
        h.adapter.requests[1].at.difference(t0),
        const Duration(seconds: 1),
      );
      advance(a, const Duration(seconds: 1));
      expect(r.succeeded, isTrue);
    }, session: sessionAt());
  });
}
