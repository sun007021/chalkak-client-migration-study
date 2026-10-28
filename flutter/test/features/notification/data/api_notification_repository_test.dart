import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/notification/data/api_notification_repository.dart';
import 'package:chalkak/features/notification/domain/notification_models.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/net_harness.dart';
import '../../../support/notification_fakes.dart';

const _list = '$v1/notifications';
String _detailPath(int nn) => '$_list/${notiId(nn)}';
String _readPath(int nn) => '$_list/${notiId(nn)}/read';

ApiNotificationRepository _repo(NetHarness h) =>
    ApiNotificationRepository(client: h.client);

ApiError _err(Probe<Object?> p) => p.error! as ApiError;

Probe<NotificationPage> _page(NetHarness h, {int page = 1}) =>
    Probe(_repo(h).fetchPage(page: page));

void main() {
  group('목록 요청과 해석', () {
    netTest(
      'TC-NOTI-002 첫 진입은 GET /notifications?page=1&pageSize=20을 인증 헤더와 함께 보낸다',
      (h, a) {
        h.adapter.on('GET', _list, [FakeResponse.fixture(pageFx1)]);
        final r = _page(h);
        settle(a);
        expect(r.succeeded, isTrue);
        final req = h.adapter.requests.single;
        expect(req.method, 'GET');
        expect(req.uri.queryParameters, {'page': '1', 'pageSize': '20'});
        expect(req.hasAuthorization, isTrue);
      },
      session: sessionAt(),
    );

    netTest('TC-NOTI-015 다음 페이지는 page=2로 요청한다', (h, a) {
      h.adapter.on('GET', _list, [FakeResponse.fixture(pageFx2Last)]);
      final r = _page(h, page: 2);
      settle(a);
      expect(h.adapter.requests.single.uri.queryParameters['page'], '2');
      expect(r.value!.hasNext, isFalse);
      expect(r.value!.items, hasLength(5));
    }, session: sessionAt());

    netTest(
      'TC-NOTI-003 id, type, sourceType, sourceId, title, body, thumbnailImageUrl, readAt, createdAt을 읽는다',
      (h, a) {
        h.adapter.on('GET', _list, [FakeResponse.fixture(pageFx1)]);
        final r = _page(h);
        settle(a);
        final page = r.value!;
        expect(page.currentPage, 1);
        expect(page.pageSize, 20);
        expect(page.hasNext, isTrue);
        expect(
          page.items.map((i) => i.id),
          notiIdsOf(pageFx1),
          reason: '응답 순서 그대로',
        );
        final first = page.items.first;
        expect(first.type, NotificationType.postApproved);
        expect(first.rawType, 'POST_APPROVED');
        expect(first.sourceType, 'POST');
        expect(first.sourceId, myPostId);
        expect(first.title, '사진이 승인되었어요');
        expect(first.body, '오늘의 사진이 전시에 올라갔어요.');
        expect(first.thumbnailImageUrl, isNotNull);
        expect(first.readAt, isNull);
        expect(first.isUnread, isTrue);
        expect(first.createdAt.isUtc, isTrue);
        final read = page.items[5];
        expect(read.readAt, DateTime.utc(2026, 10, 26, 23, 10));
        expect(read.isUnread, isFalse);
      },
      session: sessionAt(),
    );

    netTest('TC-NOTI-003 모든 type을 구분하고 썸네일 null을 허용한다', (h, a) {
      h.adapter.on('GET', _list, [FakeResponse.fixture(pageFx1)]);
      final r = _page(h);
      settle(a);
      final types = r.value!.items.map((i) => i.type).toSet();
      expect(types, {
        NotificationType.postApproved,
        NotificationType.postRejected,
        NotificationType.aiReviewCompleted,
        NotificationType.aiReviewFailed,
        NotificationType.notice,
      });
      expect(r.value!.items[4].thumbnailImageUrl, isNull);
    }, session: sessionAt());

    netTest('TC-NOTI-003 createdAt은 소수 초가 있거나 없는 UTC Instant 모두 읽는다', (h, a) {
      h.adapter.on('GET', _list, [FakeResponse.fixture(pageFxKst)]);
      final r = _page(h);
      settle(a);
      final items = r.value!.items;
      expect(items[0].createdAt, DateTime.utc(2026, 10, 26, 15));
      expect(items[2].createdAt, DateTime.utc(2026, 10, 26, 15, 0, 0, 123));
    }, session: sessionAt());

    netTest('TC-NOTI-024 알 수 없는 type과 null sourceType은 오류 없이 읽는다', (h, a) {
      h.adapter.on('GET', _list, [FakeResponse.fixture(pageFxUnknownType)]);
      final r = _page(h);
      settle(a);
      expect(r.succeeded, isTrue);
      final item = r.value!.items.single;
      expect(item.type, NotificationType.unknown);
      expect(item.rawType, 'FUTURE_TYPE');
      expect(item.sourceType, isNull);
      expect(item.sourceId, isNull);
    }, session: sessionAt());

    netTest('TC-NOTI-023 날짜로 거르지 않고 서버가 준 항목을 모두 돌려준다', (h, a) {
      h.adapter.on('GET', _list, [FakeResponse.fixture(pageFx30Day)]);
      final r = _page(h);
      settle(a);
      expect(r.value!.items, hasLength(2));
    }, session: sessionAt());

    netTest('TC-NOTI-005 빈 응답은 항목 0건, hasNext=false', (h, a) {
      h.adapter.on('GET', _list, [FakeResponse.fixture(pageFxEmpty)]);
      final r = _page(h);
      settle(a);
      expect(r.value!.items, isEmpty);
      expect(r.value!.hasNext, isFalse);
    }, session: sessionAt());
  });

  group('목록 오류', () {
    netTest('TC-NOTI-008 필수 필드(title) 누락은 invalidResponse', (h, a) {
      h.adapter.on('GET', _list, [FakeResponse.fixture(pageFxMissing)]);
      final r = _page(h);
      settle(a);
      expect(_err(r).isInvalidResponse, isTrue);
    }, session: sessionAt());

    netTest('TC-NOTI-008 깨진 JSON도 invalidResponse', (h, a) {
      h.adapter.on('GET', _list, [
        FakeResponse.fixture('common/ok__malformed-json.json'),
      ]);
      final r = _page(h);
      settle(a);
      expect(_err(r).isInvalidResponse, isTrue);
    }, session: sessionAt());

    netTest('TC-NOTI-010 404는 status 404 오류로 던진다', (h, a) {
      h.adapter.on('GET', _list, [FakeResponse.fixture(pageFx404)]);
      final r = _page(h);
      settle(a);
      expect(_err(r).status, 404);
    }, session: sessionAt());

    netTest('TC-NOTI-006 500은 재시도(0.5초, 1초) 뒤에도 실패하면 server 오류', (h, a) {
      h.adapter.on('GET', _list, [FakeResponse.fixture(pageFx500)]);
      final r = _page(h);
      advance(a, const Duration(seconds: 3));
      expect(_err(r).status, 500);
      expect(h.adapter.count('GET', _list), 3);
    }, session: sessionAt());

    netTest('TC-NOTI-009 401 UNAUTHORIZED는 refresh 후 1회만 재전송한다', (h, a) {
      h.adapter.on('GET', _list, [
        FakeResponse.fixture(pageFx401),
        FakeResponse.fixture(pageFx1),
      ]);
      h.adapter.on('POST', '$v1/auth/refresh', [
        FakeResponse.fixture('auth/refresh__success.json'),
      ]);
      final r = _page(h);
      settle(a);
      expect(r.succeeded, isTrue);
      expect(h.refreshCalls, 1);
      expect(h.adapter.count('GET', _list), 2);
    }, session: sessionAt());
  });

  group('상세', () {
    netTest('TC-NOTI-042 반려 알림: 원본 사진과 반려 사유를 읽고 GET만 보낸다(읽음 PATCH 0건)', (
      h,
      a,
    ) {
      h.adapter.on('GET', _detailPath(2), [
        FakeResponse.fixture(detailRejectedFx),
      ]);
      final r = Probe(_repo(h).fetchDetail(notiId(2)));
      settle(a);
      final d = r.value!;
      expect(d.type, NotificationType.postRejected);
      expect(d.originalImageUrl, isNotNull);
      expect(d.rejectionReason, contains('얼굴'));
      expect(h.adapter.requests.map((q) => q.method), ['GET']);
      expect(h.adapter.requests.single.hasAuthorization, isTrue);
    }, session: sessionAt());

    netTest('TC-NOTI-041 상세 조회만으로 PATCH read는 0건이다', (h, a) {
      h.adapter.on('GET', _detailPath(2), [
        FakeResponse.fixture(detailRejectedFx),
      ]);
      Probe(_repo(h).fetchDetail(notiId(2)));
      settle(a);
      expect(h.adapter.requests.where((q) => q.method == 'PATCH'), isEmpty);
    }, session: sessionAt());

    netTest('TC-NOTI-044 공지 상세: 사진·반려 사유는 null', (h, a) {
      h.adapter.on('GET', _detailPath(5), [
        FakeResponse.fixture(detailNoticeFx),
      ]);
      final r = Probe(_repo(h).fetchDetail(notiId(5)));
      settle(a);
      final d = r.value!;
      expect(d.type, NotificationType.notice);
      expect(d.originalImageUrl, isNull);
      expect(d.rejectionReason, isNull);
      expect(d.body, contains('\n'));
    }, session: sessionAt());

    netTest('TC-NOTI-047 승인 알림 상세도 읽는다', (h, a) {
      h.adapter.on('GET', _detailPath(1), [
        FakeResponse.fixture(detailApprovedFx),
      ]);
      final r = Probe(_repo(h).fetchDetail(notiId(1)));
      settle(a);
      expect(r.value!.type, NotificationType.postApproved);
      expect(r.value!.originalImageUrl, isNotNull);
    }, session: sessionAt());

    netTest('TC-NOTI-045 상세 404는 status 404 오류', (h, a) {
      h.adapter.on('GET', '$_list/${notiId(99)}', [
        FakeResponse.fixture(notiDetail404Fx),
      ]);
      final r = Probe(_repo(h).fetchDetail(notiId(99)));
      settle(a);
      expect(_err(r).status, 404);
    }, session: sessionAt());

    netTest('TC-NOTI-046 상세 500은 server 오류로 끝난다', (h, a) {
      h.adapter.on('GET', _detailPath(2), [
        FakeResponse.fixture(notiDetail500Fx),
      ]);
      final r = Probe(_repo(h).fetchDetail(notiId(2)));
      advance(a, const Duration(seconds: 3));
      expect(_err(r).status, 500);
    }, session: sessionAt());
  });

  group('읽음 처리', () {
    netTest(
      'TC-NOTI-027 TC-PUSH-053 PATCH /notifications/{id}/read를 본문 없이 보내고 204를 성공으로 읽는다',
      (h, a) {
        h.adapter.on('PATCH', _readPath(1), [FakeResponse.fixture(readOkFx)]);
        final r = Probe(_repo(h).markRead(notiId(1)));
        settle(a);
        expect(r.succeeded, isTrue);
        final req = h.adapter.requests.single;
        expect(req.method, 'PATCH');
        expect(req.path, _readPath(1));
        expect(req.body ?? '', isEmpty);
        expect(req.hasAuthorization, isTrue);
      },
      session: sessionAt(),
    );

    netTest('TC-NOTI-037 이미 읽은 알림을 다시 보내도 204를 성공으로 처리한다', (h, a) {
      h.adapter.on('PATCH', _readPath(6), [FakeResponse.fixture(readOkFx)]);
      final r = Probe(_repo(h).markRead(notiId(6)));
      settle(a);
      expect(r.succeeded, isTrue);
    }, session: sessionAt());

    netTest('TC-PUSH-048 대문자 UUID는 경로에 소문자 정규형으로 보낸다', (h, a) {
      h.adapter.on('PATCH', _readPath(1), [FakeResponse.fixture(readOkFx)]);
      Probe(_repo(h).markRead(notiId(1).toUpperCase()));
      settle(a);
      expect(h.adapter.requests.single.path, _readPath(1));
    }, session: sessionAt());

    netTest('TC-NOTI-033 TC-PUSH-055 읽음 404는 status 404 오류', (h, a) {
      h.adapter.on('PATCH', '$_list/${notiId(99)}/read', [
        FakeResponse.fixture(read404Fx),
      ]);
      final r = Probe(_repo(h).markRead(notiId(99)));
      settle(a);
      expect(_err(r).status, 404);
    }, session: sessionAt());

    netTest('TC-NOTI-034 TC-PUSH-056 읽음 500은 재시도 뒤 server 오류', (h, a) {
      h.adapter.on('PATCH', _readPath(1), [FakeResponse.fixture(read500Fx)]);
      final r = Probe(_repo(h).markRead(notiId(1)));
      advance(a, const Duration(seconds: 3));
      expect(_err(r).status, 500);
      expect(
        h.adapter.count('PATCH', _readPath(1)),
        3,
        reason: 'PATCH는 멱등이라 재시도한다(D-21)',
      );
    }, session: sessionAt());

    netTest(
      'TC-NOTI-035 TC-PUSH-057 읽음 401 UNAUTHORIZED는 refresh 후 1회 재전송해 성공한다',
      (h, a) {
        h.adapter.on('PATCH', _readPath(1), [
          FakeResponse.fixture(read401Fx),
          FakeResponse.fixture(readOkFx),
        ]);
        h.adapter.on('POST', '$v1/auth/refresh', [
          FakeResponse.fixture('auth/refresh__success.json'),
        ]);
        final r = Probe(_repo(h).markRead(notiId(1)));
        settle(a);
        expect(r.succeeded, isTrue);
        expect(h.refreshCalls, 1);
        expect(h.adapter.count('PATCH', _readPath(1)), 2);
      },
      session: sessionAt(),
    );

    netTest('REQ-NOTI-013 모두 읽음(read-all)은 어떤 경우에도 호출하지 않는다', (h, a) {
      h.adapter.on('PATCH', _readPath(1), [FakeResponse.fixture(readOkFx)]);
      h.adapter.on('GET', _list, [FakeResponse.fixture(pageFx1)]);
      Probe(_repo(h).markRead(notiId(1)));
      _page(h);
      settle(a);
      expect(
        h.adapter.requests.where((q) => q.path.endsWith('/read-all')),
        isEmpty,
      );
    }, session: sessionAt());
  });
}
