import 'package:chalkak/core/push/push_payload.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/notification_fakes.dart';

void main() {
  group('PushPayload.fromData', () {
    test('TC-PUSH-050 문자열 data에서 type, notificationId, sourceType, sourceId, eventId를 읽는다', () {
      final p = PushPayload.fromData(pushDataFx('payload__post-approved'));
      expect(p.type, 'POST_APPROVED');
      expect(p.pushType, PushType.postApproved);
      expect(p.notificationId, notiId(1));
      expect(p.sourceType, 'POST');
      expect(p.sourceId, myPostId);
      expect(p.eventId, '66666666-6666-4666-8666-666666666601');
    });

    test('TC-PUSH-050 알려진 type 일곱 개를 모두 구분한다', () {
      for (final t in PushType.values) {
        expect(PushPayload.fromData({'type': t.wire}).pushType, t);
      }
    });

    test('TC-PUSH-044 알 수 없는 type은 pushType이 null이고 원문은 남는다', () {
      final p = PushPayload.fromData(pushDataFx('payload__unknown-type'));
      expect(p.type, isNotNull);
      expect(p.pushType, isNull);
    });

    test('TC-PUSH-045 type이 없으면 type과 pushType이 null이다', () {
      final p = PushPayload.fromData(pushDataFx('payload__missing-type'));
      expect(p.type, isNull);
      expect(p.pushType, isNull);
      expect(p.notificationId, notiId(7));
    });

    test('TC-PUSH-049 값이 숫자·중첩 JSON·배열이면 그 필드는 없는 것으로 보고 예외가 없다', () {
      final p = PushPayload.fromData(pushDataFx('payload__non-string-values'));
      expect(p.type, 'POST_APPROVED');
      expect(p.eventId, isNull, reason: '숫자');
      expect(p.notificationId, isNull, reason: '중첩 JSON');
      expect(p.sourceId, isNull, reason: '배열');
      expect(p.sourceType, 'POST');
    });

    test('TC-PUSH-049 data가 비어 있어도 예외 없이 모든 필드가 null이다', () {
      final p = PushPayload.fromData(const {});
      expect([
        p.type,
        p.notificationId,
        p.sourceType,
        p.sourceId,
        p.eventId,
      ], everyElement(isNull));
    });

    test('TC-PUSH-048 대문자 UUID는 파싱 단계에서 값을 바꾸지 않는다(정규화는 라우팅)', () {
      final p = PushPayload.fromData(pushDataFx('payload__uppercase-uuid'));
      expect(p.notificationId, '33333333-3333-4333-8333-3333333333AB');
    });
  });

  group('플랫폼 어댑터', () {
    final expected = pushPayloadFx('payload__post-approved');

    void expectSame(PushPayload actual) {
      expect(actual.type, expected.type);
      expect(actual.notificationId, expected.notificationId);
      expect(actual.sourceType, expected.sourceType);
      expect(actual.sourceId, expected.sourceId);
      expect(actual.eventId, expected.eventId);
    }

    test(
      'TC-PUSH-050 iOS APNs userInfo(평탄 구조, aps 키 포함)가 같은 PushPayload가 된다',
      () {
        expectSame(
          PushPayloadAdapters.fromApnsUserInfo({
            'aps': {
              'alert': {'title': '사진이 승인되었어요', 'body': '본문'},
              'sound': 'default',
            },
            'gcm.message_id': '0:1234',
            ...pushDataFx('payload__post-approved'),
          }),
        );
      },
    );

    test('TC-PUSH-050 Android 인텐트 extras(google.message_id 등 플랫폼 키 포함)가 같은 PushPayload가 된다', () {
      expectSame(
        PushPayloadAdapters.fromAndroidExtras({
          'google.message_id': '0:1234',
          'google.sent_time': 1793070000000,
          'from': '1234567890',
          'collapse_key': 'com.stonefive.chalkak',
          ...pushDataFx('payload__post-approved'),
        }),
      );
    });

    test('TC-PUSH-050 Flutter 플러그인 RemoteMessage.data가 같은 PushPayload가 된다', () {
      expectSame(
        PushPayloadAdapters.fromPluginData(
          pushDataFx('payload__post-approved'),
        ),
      );
    });

    test('TC-PUSH-050 iOS 중첩 notification/data 구조는 가정하지 않아 type 없음이 된다', () {
      final p = PushPayloadAdapters.fromApnsUserInfo({
        'notification': {'title': 't', 'body': 'b'},
        'data': pushDataFx('payload__post-approved'),
      });
      expect(p.type, isNull);
      expect(p.notificationId, isNull);
    });
  });
}
