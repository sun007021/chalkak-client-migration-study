import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/core/time/kst_format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('알림 시각', () {
    test('TC-TIME-024 M월 d일 HH:mm KST 24시간제, 연도 없음', () {
      // 2026-10-20T05:00:00Z = KST 14:00
      expect(
        KstFormat.notificationTime(DateTime.utc(2026, 10, 20, 5)),
        '10월 20일 14:00',
      );
      // 오후 12시간제가 아니라 24시간제
      expect(
        KstFormat.notificationTime(DateTime.utc(2026, 10, 20, 12, 5)),
        '10월 20일 21:05',
      );
    });

    test('TC-TIME-024 KST 자정 경계(날짜가 넘어가고 시각은 00:00 패딩)', () {
      expect(
        KstFormat.notificationTime(DateTime.utc(2026, 10, 26, 14, 59)),
        '10월 26일 23:59',
      );
      expect(
        KstFormat.notificationTime(DateTime.utc(2026, 10, 26, 15)),
        '10월 27일 00:00',
      );
      expect(
        KstFormat.notificationTime(DateTime.utc(2026, 12, 31, 15, 7)),
        '1월 1일 00:07',
      );
    });

    test('TC-TIME-003 TC-TIME-024 입력이 로컬/UTC여도 같은 문자열(D-09)', () {
      final utc = DateTime.utc(2026, 10, 20, 5);
      expect(KstFormat.notificationTime(utc.toLocal()), '10월 20일 14:00');
      expect(KstFormat.notificationTime(utc), '10월 20일 14:00');
    });
  });

  group('날짜 라벨', () {
    test('TC-TIME-023 TC-FEED-013 월·일 0 패딩 없음', () {
      expect(KstFormat.topicLabel(const KstDate(2026, 1, 5)), '1월 5일의 주제');
      expect(KstFormat.topicLabel(const KstDate(2026, 12, 31)), '12월 31일의 주제');
      expect(
        KstFormat.todayTopicLabel(const KstDate(2026, 1, 5)),
        '1월 5일 · 오늘의 주제',
      );
      expect(
        KstFormat.todayTopicLabel(const KstDate(2026, 10, 20)),
        '10월 20일 · 오늘의 주제',
      );
    });
  });

  test('TC-TIME-012 요일 머리글은 일월화수목금토 순서', () {
    expect(KstFormat.weekdayHeaders.join(), '일월화수목금토');
  });

  test('달력 이미지 파일명', () {
    expect(
      KstFormat.calendarImageFileName(const KstMonth(2026, 10)),
      'chalkak-calendar-2026-10.png',
    );
    expect(
      KstFormat.calendarImageFileName(const KstMonth(2026, 3)),
      'chalkak-calendar-2026-03.png',
    );
  });

  test('고정 문구', () {
    expect(Copy.displayPickerTitle, '날짜 선택');
    expect(Copy.recordPickerTitle, '날짜 선택');
  });
}
