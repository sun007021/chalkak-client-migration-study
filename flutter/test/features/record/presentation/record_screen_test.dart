import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/record/domain/record_state.dart';
import 'package:chalkak/features/record/presentation/record_screen.dart';
import 'package:chalkak/features/record/presentation/record_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart' show byId, isEnabled, widgetTest;
import '../../../support/fake_adapter.dart';
import '../../../support/net_harness.dart' show v1;
import '../../../support/record_fakes.dart';

Future<void> _pump(
  WidgetTester tester,
  RecordRig r, {
  bool enter = true,
}) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(body: RecordScreen(viewModel: r.vm)),
    ),
  );
  if (enter) {
    unawaited(r.vm.enter());
    await _settle(tester);
  }
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 500));
  }
}

Finder _text(String id, String text) =>
    find.descendant(of: byId(id), matching: find.text(text));

Finder _day(String date) => byId(RecordTestIds.day(date));

void main() {
  widgetTest('TC-REC-042 정상 상태에 testids.md 기록 식별자가 존재하고 상태 전용 요소는 없다', (
    tester,
  ) async {
    final r = RecordRig();
    await _pump(tester, r);
    for (final id in [
      RecordTestIds.root,
      RecordTestIds.monthLabel,
      RecordTestIds.prevMonthButton,
      RecordTestIds.nextMonthButton,
      RecordTestIds.monthPickerButton,
      RecordTestIds.weekdayHeader,
      RecordTestIds.calendarGrid,
      RecordTestIds.day('2026-10-01'),
      RecordTestIds.day('2026-10-31'),
      RecordTestIds.selectedPhoto,
      RecordTestIds.viewFeedButton,
      RecordTestIds.viewDisplayButton,
      RecordTestIds.saveImageButton,
    ]) {
      expect(byId(id), findsOneWidget, reason: id);
    }
    for (final id in [
      RecordTestIds.loading,
      RecordTestIds.emptyState,
      RecordTestIds.errorState,
      RecordTestIds.loginRequiredState,
      RecordTestIds.invalidMonthMessage,
      RecordTestIds.retryButton,
      RecordTestIds.pendingBadge,
      RecordTestIds.pendingTooltip,
      RecordTestIds.monthPickerSheet,
    ]) {
      expect(byId(id), findsNothing, reason: id);
    }
    expect(
      find.descendant(
        of: byId(RecordTestIds.monthLabel),
        matching: find.textContaining('2026'),
      ),
      findsOneWidget,
    );
  });

  widgetTest('TC-REC-009 요일 머리글은 일월화수목금토이고 격자는 일요일 시작 7열이다', (tester) async {
    final r = RecordRig();
    await _pump(tester, r);
    final headers = tester
        .widgetList<Text>(
          find.descendant(
            of: byId(RecordTestIds.weekdayHeader),
            matching: find.byType(Text),
          ),
        )
        .map((t) => t.data)
        .toList();
    expect(headers.join(), Copy.recordWeekday);
    expect(headers, hasLength(7));

    double x(String d) => tester.getTopLeft(_day(d)).dx;
    double y(String d) => tester.getTopLeft(_day(d)).dy;
    // 2026-10-01은 목요일: 같은 행의 1일(목)·2일(금)·3일(토), 다음 행의 4일(일)이 맨 앞 열.
    expect(y('2026-10-01'), y('2026-10-03'));
    expect(y('2026-10-04'), greaterThan(y('2026-10-03')));
    expect(x('2026-10-04'), x('2026-10-11'));
    expect(x('2026-10-04'), lessThan(x('2026-10-05')));
    expect(x('2026-10-01'), lessThan(x('2026-10-02')));
    // 이전·다음 달 날짜는 채우지 않는다.
    expect(_day('2026-11-01'), findsNothing);
    expect(_day('2026-09-30'), findsNothing);
  });

  widgetTest('TC-REC-011 사진 있는 칸은 썸네일, PENDING 칸은 배지, 기록 없는 날은 빈 칸이다', (
    tester,
  ) async {
    final r = RecordRig();
    await _pump(tester, r);
    for (final date in ['2026-10-20', '2026-10-27', '2026-10-31']) {
      expect(
        find.descendant(of: _day(date), matching: find.byType(Image)),
        findsOneWidget,
        reason: date,
      );
    }
    expect(
      find.descendant(of: _day('2026-10-01'), matching: find.byType(Image)),
      findsNothing,
    );
    expect(
      _text(RecordTestIds.day('2026-10-27'), Copy.recordPendingBadge),
      findsOneWidget,
    );
    expect(
      _text(RecordTestIds.day('2026-10-20'), Copy.recordPendingBadge),
      findsNothing,
    );
    expect(
      _text(RecordTestIds.day('2026-10-31'), Copy.recordPendingBadge),
      findsNothing,
    );
  });

  widgetTest('TC-REC-034 APPROVED 선택 영역의 두 동작이 피드·전시 이동을 요청한다', (tester) async {
    final r = RecordRig();
    await _pump(tester, r);
    expect(
      _text(RecordTestIds.viewFeedButton, Copy.recordActionFeed),
      findsOneWidget,
    );
    expect(
      _text(RecordTestIds.viewDisplayButton, Copy.recordActionDisplay),
      findsOneWidget,
    );
    await tester.tap(byId(RecordTestIds.viewFeedButton));
    await tester.tap(byId(RecordTestIds.viewDisplayButton));
    await tester.pump();
    expect((r.events[0] as RecordOpenFeed).photo.postId, postOct31);
    expect(
      (r.events[1] as RecordOpenDisplay).date,
      const KstDate(2026, 10, 31),
    );
  });

  widgetTest('TC-REC-035 PENDING 날짜는 배지와 안내만 보이고 동작 버튼은 숨겨지며 상세 API를 부르지 않는다', (
    tester,
  ) async {
    final r = RecordRig();
    await _pump(tester, r);
    await tester.tap(_day('2026-10-27'));
    await _settle(tester);
    expect(byId(RecordTestIds.selectedPhoto), findsOneWidget);
    expect(
      _text(RecordTestIds.pendingBadge, Copy.recordPendingBadge),
      findsOneWidget,
    );
    expect(byId(RecordTestIds.viewFeedButton), findsNothing);
    expect(byId(RecordTestIds.viewDisplayButton), findsNothing);
    expect(byId(RecordTestIds.pendingTooltip), findsNothing);
    expect(find.bySemanticsLabel(Copy.recordPendingHintOpen), findsOneWidget);

    await tester.tap(byId(RecordTestIds.pendingBadge));
    await tester.pump();
    expect(find.text(Copy.recordPendingTooltip), findsOneWidget);
    expect(byId(RecordTestIds.pendingTooltip), findsOneWidget);
    expect(find.bySemanticsLabel(Copy.recordPendingHintClose), findsOneWidget);

    await tester.tap(byId(RecordTestIds.pendingBadge));
    await tester.pump();
    expect(byId(RecordTestIds.pendingTooltip), findsNothing);
    expect(r.api.postDetailCalls, 0);
  });

  widgetTest('TC-REC-037 사진이 없는 칸을 눌러도 선택은 그대로이고 기록 없는 달은 오류가 아니다', (
    tester,
  ) async {
    final r = RecordRig();
    r.api.months([
      FakeResponse.json(200, {
        'months': [
          {'year': 2026, 'month': 10},
          {'year': 2026, 'month': 9},
          {'year': 2026, 'month': 8},
        ],
      }),
    ]);
    r.api.calendar(2026, 8, [fx('record/posts-calendar__2026-08-empty.json')]);
    await _pump(tester, r);
    await tester.tap(_day('2026-10-02'));
    await tester.pump();
    expect(r.state.selectedDate, const KstDate(2026, 10, 31));

    unawaited(r.vm.selectMonth(const KstMonth(2026, 8)));
    await _settle(tester);
    expect(byId(RecordTestIds.selectedPhoto), findsNothing);
    expect(byId(RecordTestIds.emptyState), findsOneWidget);
    expect(byId(RecordTestIds.errorState), findsNothing);
    expect(byId(RecordTestIds.loading), findsNothing);
    expect(_day('2026-08-31'), findsOneWidget, reason: '빈 달도 격자는 그린다');
  });

  widgetTest('TC-REC-004 TC-REC-003 월 선택 시트에 선택지가 최신순으로 있고 고르면 그 달로 이동한다', (
    tester,
  ) async {
    final r = RecordRig();
    r.api.months([fx('record/posts-calendar-months__without-current.json')]);
    await _pump(tester, r);
    await tester.tap(byId(RecordTestIds.monthPickerButton));
    await _settle(tester);
    expect(byId(RecordTestIds.monthPickerSheet), findsOneWidget);
    expect(
      byId(RecordTestIds.monthPickerItem('2026-10')),
      findsOneWidget,
      reason: '현재 달은 목록에 없어도 존재',
    );
    expect(byId(RecordTestIds.monthPickerItem('2026-09')), findsOneWidget);
    expect(byId(RecordTestIds.monthPickerItem('2026-08')), findsNothing);
    expect(find.text(Copy.recordPickerTitle), findsOneWidget);

    await tester.tap(byId(RecordTestIds.monthPickerItem('2026-09')));
    await _settle(tester);
    expect(r.state.selectedMonth, const KstMonth(2026, 9));
    expect(byId(RecordTestIds.monthPickerSheet), findsNothing);
    expect(_day('2026-09-30'), findsOneWidget);
  });

  widgetTest('TC-REC-016 이전·다음 달 화살표가 달을 옮기고 끝에서는 비활성이다', (tester) async {
    final r = RecordRig();
    await _pump(tester, r);
    expect(isEnabled(tester, RecordTestIds.prevMonthButton), isTrue);
    expect(isEnabled(tester, RecordTestIds.nextMonthButton), isFalse);
    await tester.tap(byId(RecordTestIds.prevMonthButton));
    await _settle(tester);
    expect(r.state.selectedMonth, const KstMonth(2026, 9));
    expect(isEnabled(tester, RecordTestIds.prevMonthButton), isFalse);
    expect(isEnabled(tester, RecordTestIds.nextMonthButton), isTrue);
    expect(_day('2026-09-17'), findsOneWidget);
    await tester.tap(byId(RecordTestIds.nextMonthButton));
    await _settle(tester);
    expect(r.state.selectedMonth, const KstMonth(2026, 10));
  });

  widgetTest('TC-REC-021 캐시 없는 달을 불러오는 동안 로딩 표시만 있고 끝나면 사라진다', (tester) async {
    final r = RecordRig();
    r.api.calendar(2026, 10, [
      fx(
        'record/posts-calendar__2026-10.json',
        delay: const Duration(seconds: 3),
      ),
    ]);
    await _pump(tester, r, enter: false);
    unawaited(r.vm.enter());
    await tester.pump(const Duration(milliseconds: 500));
    expect(byId(RecordTestIds.loading), findsOneWidget);
    expect(byId(RecordTestIds.selectedPhoto), findsNothing);
    await _settle(tester);
    expect(byId(RecordTestIds.loading), findsNothing);
    expect(byId(RecordTestIds.selectedPhoto), findsOneWidget);
  });

  widgetTest(
    'TC-REC-030 갱신 불가 401은 "로그인이 필요해요"와 "로그인 하기"를 보이고 누르면 로그인 이동을 요청한다',
    (tester) async {
      final r = RecordRig();
      r.api.calendar(2026, 10, [
        fx('record/posts-calendar__401-unauthorized.json'),
      ]);
      r.http.adapter.on('POST', '$v1/auth/refresh', [
        fx('auth/refresh__reauthentication-required.json'),
      ]);
      await _pump(tester, r);
      expect(byId(RecordTestIds.loginRequiredState), findsOneWidget);
      expect(find.text(Copy.recordErr401), findsOneWidget);
      expect(
        _text(RecordTestIds.loginButton, Copy.recordGuestLogin),
        findsOneWidget,
      );
      expect(byId(RecordTestIds.retryButton), findsNothing);
      await tester.tap(byId(RecordTestIds.loginButton));
      await tester.pump();
      expect(r.events.single, isA<RecordGoToLogin>());
    },
  );

  widgetTest('TC-REC-031 서버 400은 "조회할 수 없는 연월이에요" 메시지를 보인다', (tester) async {
    final r = RecordRig();
    r.api.calendar(2026, 10, [
      fx('record/posts-calendar__400-invalid-month.json'),
    ]);
    await _pump(tester, r);
    expect(
      _text(RecordTestIds.invalidMonthMessage, Copy.recordErr400),
      findsOneWidget,
    );
    expect(byId(RecordTestIds.loginRequiredState), findsNothing);
  });

  widgetTest('TC-REC-032 서버 500은 "기록을 불러오지 못했어요"와 다시 시도를 보이고 누르면 복구된다', (
    tester,
  ) async {
    final r = RecordRig();
    r.api.calendar(2026, 10, [
      ...failing('record/posts-calendar__500-server-error.json'),
      fx('record/posts-calendar__2026-10.json'),
    ]);
    await _pump(tester, r);
    expect(byId(RecordTestIds.errorState), findsOneWidget);
    expect(find.text(Copy.recordErrOther), findsOneWidget);
    expect(byId(RecordTestIds.selectedPhoto), findsNothing);
    await tester.tap(byId(RecordTestIds.retryButton));
    await _settle(tester);
    expect(byId(RecordTestIds.errorState), findsNothing);
    expect(byId(RecordTestIds.selectedPhoto), findsOneWidget);
  });

  widgetTest('TC-REC-038 "이미지로 저장"을 누르면 저장이 한 번 실행된다', (tester) async {
    final r = RecordRig();
    await _pump(tester, r);
    expect(
      _text(RecordTestIds.saveImageButton, Copy.recordSave),
      findsOneWidget,
    );
    await tester.tap(byId(RecordTestIds.saveImageButton));
    await _settle(tester);
    expect(r.saver.fileNames, ['chalkak-calendar-2026-10.png']);
    expect(r.toast.messages, [Copy.recordSaveOk]);
  });
}
