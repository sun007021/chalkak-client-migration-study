import 'package:chalkak/features/notification/domain/notification_models.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/notification_fakes.dart';

NotificationItem _at(DateTime createdAt) => NotificationItem(
  id: notiId(1),
  type: NotificationType.postApproved,
  rawType: 'POST_APPROVED',
  title: 't',
  body: 'b',
  createdAt: createdAt,
);

void main() {
  test('NotificationType.fromWire는 알려진 일곱 type을 구분하고 나머지는 unknown이다', () {
    for (final t in NotificationType.values.where(
      (t) => t != NotificationType.unknown,
    )) {
      expect(NotificationType.fromWire(t.wire), t);
    }
    expect(NotificationType.fromWire('FUTURE_TYPE'), NotificationType.unknown);
    expect(NotificationType.fromWire(''), NotificationType.unknown);
  });

  test('TC-NOTI-012 createdAt 15:00Z / 14:59:59Z는 KST 자정 경계 문구가 된다', () {
    expect(_at(DateTime.utc(2026, 10, 26, 15)).timeLabel, '10월 27일 00:00');
    expect(
      _at(DateTime.utc(2026, 10, 26, 14, 59, 59)).timeLabel,
      '10월 26일 23:59',
    );
  });

  test('TC-NOTI-013 입력이 UTC든 기기 로컬 DateTime이든 같은 instant면 같은 문자열이다', () {
    final utc = DateTime.utc(2026, 10, 20, 5);
    final local = DateTime.fromMillisecondsSinceEpoch(
      utc.millisecondsSinceEpoch,
    );
    expect(_at(utc).timeLabel, '10월 20일 14:00');
    expect(_at(local).timeLabel, _at(utc).timeLabel);
  });

  test('TC-NOTI-014 24시간제 ASCII 숫자 "M월 d일 HH:mm"이다(오전/오후·현지 숫자 없음)', () {
    final label = _at(DateTime.utc(2026, 10, 20, 13, 5)).timeLabel;
    expect(label, '10월 20일 22:05');
    expect(
      label,
      matches(RegExp(r'^[0-9]{1,2}월 [0-9]{1,2}일 [0-9]{2}:[0-9]{2}$')),
    );
  });
}
