import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/display/presentation/date_picker_sheet.dart';
import 'package:chalkak/features/display/presentation/display_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';

Future<List<KstDate>> _open(
  WidgetTester tester, {
  required KstDate initial,
  KstDate? now,
}) async {
  final confirmed = <KstDate>[];
  await pumpScreen(
    tester,
    Scaffold(
      body: DatePickerSheet(
        initial: initial,
        today: now ?? today,
        onConfirm: confirmed.add,
      ),
    ),
  );
  return confirmed;
}

String _n(String template, int n) => Copy.fill(template, {'n': '$n'});

Finder _in(String id, String text) =>
    find.descendant(of: byId(id), matching: find.text(text));

void main() {
  widgetTest('TC-DISP-036 시트 루트·제목·세 휠·확인 버튼이 있다', (tester) async {
    await _open(tester, initial: today);
    expect(byId(DisplayTestIds.datePickerSheet), findsOneWidget);
    expect(find.text(Copy.displayPickerTitle), findsOneWidget);
    expect(byId(DisplayTestIds.datePickerYear), findsOneWidget);
    expect(byId(DisplayTestIds.datePickerMonth), findsOneWidget);
    expect(byId(DisplayTestIds.datePickerDay), findsOneWidget);
    expect(byId(DisplayTestIds.datePickerConfirmButton), findsOneWidget);
  });

  widgetTest('TC-DISP-036 오늘이 2026-10-27이면 연 휠은 2026뿐, 월 휠은 9월·10월뿐이다', (
    tester,
  ) async {
    await _open(tester, initial: today);
    expect(
      _in(DisplayTestIds.datePickerYear, _n(Copy.displayPickerYear, 2026)),
      findsOneWidget,
    );
    expect(
      _in(DisplayTestIds.datePickerYear, _n(Copy.displayPickerYear, 2025)),
      findsNothing,
    );
    expect(
      _in(DisplayTestIds.datePickerYear, _n(Copy.displayPickerYear, 2027)),
      findsNothing,
    );
    expect(
      _in(DisplayTestIds.datePickerMonth, _n(Copy.displayPickerMonth, 10)),
      findsOneWidget,
    );
    expect(
      _in(DisplayTestIds.datePickerMonth, _n(Copy.displayPickerMonth, 9)),
      findsOneWidget,
    );
    expect(
      _in(DisplayTestIds.datePickerMonth, _n(Copy.displayPickerMonth, 8)),
      findsNothing,
    );
    expect(
      _in(DisplayTestIds.datePickerMonth, _n(Copy.displayPickerMonth, 11)),
      findsNothing,
    );
  });

  widgetTest('TC-DISP-036 일 휠은 오늘(27일)까지만 있고 선택된 날짜가 보인다', (tester) async {
    await _open(tester, initial: today);
    expect(
      _in(DisplayTestIds.datePickerDay, _n(Copy.displayPickerDay, 27)),
      findsOneWidget,
    );
    expect(
      _in(DisplayTestIds.datePickerDay, _n(Copy.displayPickerDay, 28)),
      findsNothing,
    );
    expect(
      _in(DisplayTestIds.datePickerDay, _n(Copy.displayPickerDay, 31)),
      findsNothing,
    );
  });

  widgetTest('TC-DISP-036 확인을 누르면 고른 날짜를 돌려준다', (tester) async {
    final confirmed = await _open(tester, initial: day('2026-10-05'));
    await tester.tap(byId(DisplayTestIds.datePickerConfirmButton));
    await settleUi(tester, frames: 3);
    expect(confirmed, [day('2026-10-05')]);
  });

  widgetTest('TC-DISP-034 범위 밖에서 시작해도 확인하면 범위 끝으로 맞춘 날짜를 돌려준다', (tester) async {
    final confirmed = await _open(tester, initial: day('2026-09-01'));
    await tester.tap(byId(DisplayTestIds.datePickerConfirmButton));
    await settleUi(tester, frames: 3);
    expect(confirmed, [KstDate.firstTopic]);
  });

  widgetTest('TC-DISP-037 윤년이 아닌 해의 2월은 28일까지만 있다', (tester) async {
    await _open(tester, initial: day('2027-02-28'), now: day('2027-03-05'));
    expect(
      _in(DisplayTestIds.datePickerDay, _n(Copy.displayPickerDay, 28)),
      findsOneWidget,
    );
    expect(
      _in(DisplayTestIds.datePickerDay, _n(Copy.displayPickerDay, 29)),
      findsNothing,
    );
  });
}
