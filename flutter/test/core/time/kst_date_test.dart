import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/core/time/kst_week.dart';
import 'package:chalkak/core/time/record_months.dart';
import 'package:chalkak/core/time/topic_date_rules.dart';
import 'package:flutter_test/flutter_test.dart';

KstDate d(int y, int m, int day) => KstDate(y, m, day);

void main() {
  group('KstDate', () {
    test('TC-TIME-005 API 날짜 문자열은 ASCII yyyy-MM-dd(0 패딩)', () {
      final s = const KstDate(2026, 1, 5).toApiString();
      expect(s, '2026-01-05');
      expect(RegExp(r'^[0-9]{4}-[0-9]{2}-[0-9]{2}$').hasMatch(s), isTrue);
      // 불교력(2569) 등으로 바뀌지 않는다.
      expect(const KstDate(2026, 10, 27).toApiString(), '2026-10-27');
    });

    test('TC-TIME-005 parse는 yyyy-MM-dd만 받고 잘못된 입력은 거부한다', () {
      expect(KstDate.parse('2026-09-17'), d(2026, 9, 17));
      expect(KstDate.tryParse('2026-02-30'), isNull);
      expect(KstDate.tryParse('2569-01-01'), d(2569, 1, 1));
      expect(KstDate.tryParse('٢٠٢٦-١٠-٢٧'), isNull);
      expect(KstDate.tryParse('2026-9-7'), isNull);
      expect(KstDate.tryParse(''), isNull);
      expect(() => KstDate.parse('nope'), throwsFormatException);
    });

    test('TC-TIME-009 FIRST_TOPIC_DATE는 2026-09-17', () {
      expect(KstDate.firstTopic, d(2026, 9, 17));
    });

    test('TC-TIME-011 31일을 30일 달로 옮기면 말일로 보정, 윤년 처리', () {
      expect(KstDate.clamped(2026, 11, 31), d(2026, 11, 30));
      expect(KstDate.clamped(2028, 2, 29), d(2028, 2, 29));
      expect(KstDate.clamped(2027, 2, 29), d(2027, 2, 28));
      expect(KstDate.clamped(2100, 2, 29), d(2100, 2, 28));
    });

    test('TC-TIME-012 addDays는 월·연 경계를 넘는다', () {
      expect(d(2026, 12, 31).addDays(1), d(2027, 1, 1));
      expect(d(2026, 10, 31).addDays(1), d(2026, 11, 1));
      expect(d(2026, 3, 1).addDays(-1), d(2026, 2, 28));
    });

    test('TC-TIME-012 요일 인덱스는 일요일 0 ~ 토요일 6', () {
      expect(d(2026, 10, 25).weekdayIndex, 0); // 일
      expect(d(2026, 10, 27).weekdayIndex, 2); // 화
      expect(d(2026, 10, 31).weekdayIndex, 6); // 토
    });

    test('날짜 비교', () {
      expect(d(2026, 10, 27) > d(2026, 10, 26), isTrue);
      expect(d(2026, 10, 27) >= d(2026, 10, 27), isTrue);
      expect(d(2026, 10, 27) < d(2027, 1, 1), isTrue);
    });

    test('startInstant는 KST 00:00의 UTC 순간', () {
      expect(d(2026, 10, 27).startInstant, DateTime.utc(2026, 10, 26, 15));
    });
  });

  group('KstMonth', () {
    test('말일·일수·이동·문자열', () {
      expect(const KstMonth(2028, 2).daysInMonth, 29);
      expect(const KstMonth(2027, 2).daysInMonth, 28);
      expect(const KstMonth(2026, 10).lastDate, d(2026, 10, 31));
      expect(const KstMonth(2026, 10).firstDate, d(2026, 10, 1));
      expect(const KstMonth(2026, 12).addMonths(1).toApiString(), '2027-01');
      expect(const KstMonth(2026, 1).addMonths(-1).toApiString(), '2025-12');
      expect(const KstMonth(2026, 3).toApiString(), '2026-03');
      expect(d(2026, 10, 27).yearMonth.toApiString(), '2026-10');
    });
  });

  group('KstWeek', () {
    test('TC-TIME-012 2026-10-25(일)~10-31(토) 주는 일요일 시작', () {
      final w = KstWeek.containing(d(2026, 10, 27));
      expect(w.days, hasLength(7));
      expect(w.start, d(2026, 10, 25));
      expect(w.end, d(2026, 10, 31));
      expect(w.months.map((m) => m.toApiString()), ['2026-10']);
    });

    test('TC-TIME-012 연말 경계 주(2026-12-27~2027-01-02)는 두 해에 걸친다', () {
      final w = KstWeek.containing(d(2027, 1, 1));
      expect(w.start, d(2026, 12, 27));
      expect(w.end, d(2027, 1, 2));
      expect(w.months.map((m) => m.toApiString()), ['2026-12', '2027-01']);
    });

    test('TC-TIME-013 월 경계 주(10월 말~11월 초)는 두 월에 걸치고 요일 위치가 맞다', () {
      final w = KstWeek.containing(d(2026, 11, 1)); // 일요일
      expect(w.start, d(2026, 11, 1));
      final mid = KstWeek.containing(d(2026, 10, 29));
      expect(mid.start, d(2026, 10, 25));
      final cross = KstWeek.containing(d(2027, 1, 1));
      for (var i = 0; i < 7; i++) {
        expect(cross.days[i].weekdayIndex, i);
      }
      final octNov = KstWeek.containing(d(2028, 11, 1)); // 2028-10-29(일)~11-04
      expect(octNov.months.map((m) => m.toApiString()), ['2028-10', '2028-11']);
    });
  });

  group('TopicDateRules', () {
    final today = d(2026, 10, 27);

    test('TC-TIME-009 09-17은 이동 가능, 09-16은 막힌다', () {
      expect(TopicDateRules.canSelect(d(2026, 9, 17), today: today), isTrue);
      expect(TopicDateRules.canSelect(d(2026, 9, 16), today: today), isFalse);
    });

    test('TC-TIME-007 오늘 다음 날은 선택할 수 없다', () {
      expect(TopicDateRules.canSelect(today, today: today), isTrue);
      expect(TopicDateRules.canSelect(d(2026, 10, 28), today: today), isFalse);
    });

    test('TC-TIME-007 TC-TIME-009 clamp는 가까운 경계로 보정', () {
      expect(TopicDateRules.clamp(d(2026, 9, 1), today: today), d(2026, 9, 17));
      expect(
        TopicDateRules.clamp(d(2026, 12, 1), today: today),
        d(2026, 10, 27),
      );
      expect(
        TopicDateRules.clamp(d(2026, 10, 1), today: today),
        d(2026, 10, 1),
      );
    });

    test('TC-TIME-022 TC-FEED-017 topicDate가 KST 오늘일 때만 오늘 주제', () {
      expect(TopicDateRules.isTodayTopic(today, today: today), isTrue);
      expect(
        TopicDateRules.isTodayTopic(d(2026, 10, 26), today: today),
        isFalse,
      );
      expect(
        TopicDateRules.isTodayTopic(d(2026, 10, 28), today: today),
        isFalse,
      );
    });
  });

  group('RecordMonths', () {
    test('TC-TIME-016 월 목록에 현재 달이 없어도 선택지에 넣고 최신순', () {
      final result = RecordMonths.options(
        serverMonths: const [KstMonth(2026, 9), KstMonth(2026, 10)],
        current: const KstMonth(2026, 11),
      );
      expect(result.map((m) => m.toApiString()), [
        '2026-11',
        '2026-10',
        '2026-09',
      ]);
    });

    test('TC-TIME-016 서버 목록이 비어도 현재 달만으로 진행, 중복 제거', () {
      expect(
        RecordMonths.options(
          serverMonths: const [],
          current: const KstMonth(2026, 10),
        ).map((m) => m.toApiString()),
        ['2026-10'],
      );
      expect(
        RecordMonths.options(
          serverMonths: const [KstMonth(2026, 10), KstMonth(2026, 10)],
          current: const KstMonth(2026, 10),
        ),
        hasLength(1),
      );
    });
  });
}
