import 'package:chalkak/features/feed/domain/feed_target.dart';
import 'package:chalkak/features/notification/domain/notification_route.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/notification_fakes.dart';

NavigatePlan _push(String fixture) =>
    NotificationRouter.fromPush(pushPayloadFx(fixture));

void expectInbox(NavigatePlan plan) {
  expect(plan.destination, isA<InboxDestination>());
  expect(plan.readNotificationId, isNull, reason: '알림함 폴백은 읽음 요청이 없다');
}

void expectFeed(
  NavigatePlan plan, {
  required String postId,
  required bool ai,
  required String readId,
}) {
  final d = plan.destination as FeedDestination;
  expect(d.postId, postId);
  expect(d.openAiFeedback, ai);
  expect(plan.readNotificationId, readId);
}

void main() {
  group('푸시 목적지 표(D-11)', () {
    test('TC-PUSH-037 TOPIC은 홈 맨 위 + 새로고침이고 읽음 요청이 없다', () {
      final plan = _push('payload__topic');
      final d = plan.destination as HomeDestination;
      expect(d.scrollToTopAndRefresh, isTrue);
      expect(plan.readNotificationId, isNull);
    });

    test('TC-PUSH-037 TOPIC의 sourceId(주제 날짜 ID)는 목적지에 쓰지 않는다', () {
      final plan = NotificationRouter.fromPush(
        payloadOf(type: 'TOPIC', sourceType: 'TOPIC', sourceId: 'not-a-uuid'),
      );
      expect(plan.destination, isA<HomeDestination>());
    });

    test('TC-PUSH-038 REMINDER는 홈이고 읽음 요청이 없다', () {
      final plan = _push('payload__reminder');
      final d = plan.destination as HomeDestination;
      expect(d.scrollToTopAndRefresh, isFalse);
      expect(plan.readNotificationId, isNull);
    });

    test('TC-PUSH-039 POST_APPROVED는 읽음 후 sourceId 게시물 상세로 간다', () {
      expectFeed(
        _push('payload__post-approved'),
        postId: myPostId,
        ai: false,
        readId: notiId(1),
      );
    });

    test('TC-PUSH-039 게시물 상세 인자는 FeedOrigin.push, 내 게시물, 시드 없음이다', () {
      final d = _push('payload__post-approved').destination as FeedDestination;
      expect(d.target.postId, myPostId);
      expect(d.target.origin, FeedOrigin.push);
      expect(d.target.isMine, isTrue);
      expect(d.target.seed, isNull);
    });

    test('TC-PUSH-040 AI_REVIEW_COMPLETED는 읽음 후 게시물 상세 + AI 시트 자동 열기', () {
      expectFeed(
        _push('payload__ai-review-completed'),
        postId: myPostId,
        ai: true,
        readId: notiId(3),
      );
    });

    test('TC-PUSH-040 AI_REVIEW_FAILED도 같다', () {
      final plan = _push('payload__ai-review-failed');
      final d = plan.destination as FeedDestination;
      expect(d.postId, myPostId);
      expect(d.openAiFeedback, isTrue);
      expect(plan.readNotificationId, isNotNull);
    });

    test('TC-PUSH-041 POST_REJECTED는 읽음 후 notificationId로 알림 상세', () {
      final plan = _push('payload__post-rejected');
      expect(
        (plan.destination as NotificationDetailDestination).notificationId,
        plan.readNotificationId,
      );
      expect(plan.readNotificationId, notiId(2));
    });

    test(
      'TC-PUSH-042 NOTICE는 sourceId(공지 ID)가 아니라 notificationId로 알림 상세를 연다',
      () {
        final plan = _push('payload__notice');
        final d = plan.destination as NotificationDetailDestination;
        expect(d.notificationId, notiId(5));
        expect(d.notificationId, isNot(noticeSourceId));
        expect(plan.readNotificationId, notiId(5));
      },
    );

    test('TC-PUSH-042 쓰지 않는 sourceId가 UUID가 아니어도 NOTICE·POST_REJECTED는 notificationId만 본다', () {
      final plan = NotificationRouter.fromPush(
        payloadOf(
          type: 'NOTICE',
          notificationId: notiId(5),
          sourceId: 'not-a-uuid',
        ),
      );
      expect(plan.destination, isA<NotificationDetailDestination>());
    });
  });

  group('푸시 폴백: 알림함 목록, 읽음 없음', () {
    test('TC-PUSH-043 NOTICE에 notificationId가 없으면 알림함', () {
      expectInbox(_push('payload__missing-notification-id'));
    });

    test('TC-PUSH-043 NOTICE의 notificationId가 UUID 형식이 아니어도 알림함', () {
      expectInbox(
        NotificationRouter.fromPush(
          payloadOf(
            type: 'NOTICE',
            notificationId: 'abc',
            sourceId: noticeSourceId,
          ),
        ),
      );
    });

    test('TC-PUSH-044 알 수 없는 type은 알림함', () {
      expectInbox(_push('payload__unknown-type'));
    });

    test('TC-PUSH-045 type 누락은 알림함(토스트 없이 D-11 통일)', () {
      expectInbox(_push('payload__missing-type'));
    });

    test('TC-PUSH-046 sourceId와 notificationId가 UUID가 아니면 알림함', () {
      expectInbox(_push('payload__invalid-uuid'));
    });

    test('TC-PUSH-046 POST_APPROVED의 sourceId가 UUID가 아니면 알림함', () {
      expectInbox(
        NotificationRouter.fromPush(
          payloadOf(
            type: 'POST_APPROVED',
            notificationId: notiId(1),
            sourceType: 'POST',
            sourceId: 'x',
          ),
        ),
      );
    });

    test('TC-PUSH-046 읽음이 필요한 type인데 notificationId가 없으면 알림함', () {
      expectInbox(
        NotificationRouter.fromPush(
          payloadOf(
            type: 'POST_APPROVED',
            sourceType: 'POST',
            sourceId: myPostId,
          ),
        ),
      );
    });

    test('TC-PUSH-047 AI 리뷰인데 sourceType이 POST가 아니면 알림함', () {
      expectInbox(_push('payload__ai-source-type-not-post'));
    });

    test('TC-PUSH-049 필드가 문자열이 아니라 누락으로 파싱된 payload는 알림함', () {
      expectInbox(_push('payload__non-string-values'));
    });
  });

  group('UUID 정규화와 분기 기준', () {
    test('TC-PUSH-048 대문자 UUID는 유효로 보고 경로·읽음 대상에는 소문자 정규형을 쓴다', () {
      final plan = _push('payload__uppercase-uuid');
      expect(plan.readNotificationId, '33333333-3333-4333-8333-3333333333ab');
      expect(plan.destination, isA<FeedDestination>());
    });

    test('TC-PUSH-048 sourceId가 대문자여도 게시물 id는 소문자다', () {
      final plan = NotificationRouter.fromPush(
        payloadOf(
          type: 'POST_APPROVED',
          notificationId: notiId(1),
          sourceType: 'POST',
          sourceId: myPostId.toUpperCase(),
        ),
      );
      expect((plan.destination as FeedDestination).postId, myPostId);
    });

    test('TC-PUSH-048 normalizeUuid: 유효하면 소문자, 아니면 null', () {
      expect(
        NotificationRouter.normalizeUuid(myPostId.toUpperCase()),
        myPostId,
      );
      expect(NotificationRouter.normalizeUuid(myPostId), myPostId);
      expect(NotificationRouter.normalizeUuid('not-a-uuid'), isNull);
      expect(NotificationRouter.normalizeUuid(''), isNull);
      expect(NotificationRouter.normalizeUuid(null), isNull);
      expect(NotificationRouter.normalizeUuid('${myPostId}0'), isNull);
    });

    test('TC-PUSH-051 같은 type이면 알림 제목·본문·eventId가 달라도 목적지가 같다', () {
      final a = NotificationRouter.fromPush(
        payloadOf(
          type: 'POST_APPROVED',
          notificationId: notiId(1),
          sourceType: 'POST',
          sourceId: myPostId,
          eventId: 'e1',
        ),
      );
      final b = NotificationRouter.fromPush(
        payloadOf(
          type: 'POST_APPROVED',
          notificationId: notiId(1),
          sourceType: 'POST',
          sourceId: myPostId,
          eventId: 'e2',
        ),
      );
      expect(
        (a.destination as FeedDestination).postId,
        (b.destination as FeedDestination).postId,
      );
      expect(a.readNotificationId, b.readNotificationId);
    });
  });

  group('알림함 행 탭', () {
    test('TC-NOTI-027 POST_APPROVED(sourceId 유효)는 읽음 후 게시물 상세(내 게시물)', () {
      final item = itemFx(pageFx1, notiId(1));
      final plan = NotificationRouter.fromInboxItem(item)!;
      expectFeed(plan, postId: item.sourceId!, ai: false, readId: item.id);
    });

    test('TC-NOTI-028 AI_REVIEW_COMPLETED·FAILED는 읽음 후 게시물 상세 + AI 시트', () {
      for (final nn in [3, 4]) {
        final item = itemFx(pageFx1, notiId(nn));
        final plan = NotificationRouter.fromInboxItem(item)!;
        expectFeed(plan, postId: item.sourceId!, ai: true, readId: item.id);
      }
    });

    test(
      'TC-NOTI-029 AI 알림의 sourceType이 POST가 아니거나 sourceId가 UUID가 아니면 이동하지 않는다',
      () {
        final page = notiPageFx(pageFxBadAiSource);
        expect(page.items, hasLength(2));
        for (final item in page.items) {
          expect(
            NotificationRouter.fromInboxItem(item),
            isNull,
            reason: item.id,
          );
        }
      },
    );

    test('TC-NOTI-030 NOTICE는 읽음 후 notificationId로 알림 상세(공지 sourceId가 아님)', () {
      final item = itemFx(pageFx1, notiId(5));
      final plan = NotificationRouter.fromInboxItem(item)!;
      final d = plan.destination as NotificationDetailDestination;
      expect(d.notificationId, item.id);
      expect(d.notificationId, isNot(item.sourceId));
      expect(plan.readNotificationId, item.id);
    });

    test('TC-NOTI-031 POST_REJECTED는 읽음 후 알림 상세', () {
      final item = itemFx(pageFx1, notiId(2));
      final plan = NotificationRouter.fromInboxItem(item)!;
      expect(
        (plan.destination as NotificationDetailDestination).notificationId,
        item.id,
      );
      expect(plan.readNotificationId, item.id);
    });

    test('TC-NOTI-024 알 수 없는 type(sourceType null)은 이동도 읽음도 없다', () {
      final item = notiPageFx(pageFxUnknownType).items.single;
      expect(item.rawType, 'FUTURE_TYPE');
      expect(NotificationRouter.fromInboxItem(item), isNull);
    });

    test('TC-NOTI-025 TOPIC은 홈(맨 위 + 새로고침), REMINDER는 홈이고 읽음 요청이 없다', () {
      final items = notiPageFx(pageFxTopicReminder).items;
      final topic = NotificationRouter.fromInboxItem(items[0])!;
      final reminder = NotificationRouter.fromInboxItem(items[1])!;
      expect(
        (topic.destination as HomeDestination).scrollToTopAndRefresh,
        isTrue,
      );
      expect(
        (reminder.destination as HomeDestination).scrollToTopAndRefresh,
        isFalse,
      );
      expect(topic.readNotificationId, isNull);
      expect(reminder.readNotificationId, isNull);
    });

    test(
      'TC-NOTI-026 POST_APPROVED인데 sourceType·sourceId가 null이면 이동도 읽음도 없다',
      () {
        final item = notiPageFx(pageFxNullSource).items.single;
        expect(NotificationRouter.fromInboxItem(item), isNull);
      },
    );
  });
}
