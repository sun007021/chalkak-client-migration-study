import 'package:chalkak/core/analytics/analytics_constants.dart';
import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/navigation/domain/main_shell_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

const _wait = Duration(seconds: 5);

void main() {
  fakeTest('TC-NAV-003 메인에 들어오면 홈이 선택되어 있고 screen_view home을 보낸다', (async) {
    final r = HomeRig();
    r.shell.start();
    expect(r.shell.selected, BottomDestination.home);
    expect(r.analytics.screenNames, ['home']);
    expect(r.analytics.destinations, isEmpty);
  });

  fakeTest(
    'TC-NAV-004 REQ-NAV-009~010 탭을 바꾸면 선택 표시가 따라오고 bottom_navigation_selected와 screen_view를 보낸다',
    (async) {
      final r = HomeRig();
      r.shell.start();
      r.shell.selectTab(BottomDestination.display);
      r.shell.selectTab(BottomDestination.record);
      r.shell.selectTab(BottomDestination.settings);
      expect(r.shell.selected, BottomDestination.settings);
      expect(r.analytics.destinations, ['display', 'record', 'settings']);
      expect(r.analytics.screenNames, [
        'home',
        'display',
        'record',
        'settings',
      ]);
      expect(r.api.totalCalls, 0, reason: '내비게이션 자체는 API를 부르지 않는다');
    },
  );

  fakeTest(
    'TC-NAV-008 REQ-NAV-007 전시 탭 재선택은 맨 위 스크롤 이벤트와 분석 이벤트(screen_view 없음)를 낸다',
    (async) {
      final r = HomeRig();
      r.shell.start();
      r.shell.selectTab(BottomDestination.display);
      r.shellEvents.clear();
      r.shell.selectTab(BottomDestination.display);
      settle(async);
      expect(r.shell.selected, BottomDestination.display);
      expect(
        r.shellEvents.whereType<ScrollToTop>().single.destination,
        BottomDestination.display,
      );
      expect(r.analytics.destinations, ['display', 'display']);
      expect(r.analytics.screenNames, ['home', 'display']);
    },
  );

  fakeTest('TC-NAV-009 홈 탭 재선택은 맨 위 스크롤이다(새로고침 동반 여부는 결정 필요라 검증하지 않는다)', (
    async,
  ) {
    final r = HomeRig();
    r.shell.start();
    r.shell.selectTab(BottomDestination.home);
    settle(async);
    expect(r.shell.selected, BottomDestination.home);
    expect(
      r.shellEvents.whereType<ScrollToTop>().single.destination,
      BottomDestination.home,
    );
    expect(r.analytics.destinations, ['home']);
  });

  fakeTest('REQ-NAV-004 다른 탭에서 홈으로 돌아오면 홈을 맨 위로 되돌린다', (async) {
    final r = HomeRig();
    r.shell.start();
    r.shell.selectTab(BottomDestination.display);
    r.shellEvents.clear();
    r.shell.selectTab(BottomDestination.home);
    settle(async);
    expect(
      r.shellEvents.whereType<ScrollToTop>().single.destination,
      BottomDestination.home,
    );
  });

  fakeTest('REQ-NAV-008 전시·홈 외 탭을 다시 눌러도 화면 변화(스크롤 이벤트)가 없다', (async) {
    final r = HomeRig();
    r.shell.start();
    r.shell.selectTab(BottomDestination.record);
    r.shell.selectTab(BottomDestination.settings);
    r.shellEvents.clear();
    r.shell.selectTab(BottomDestination.settings);
    settle(async);
    expect(r.shellEvents, isEmpty);
    expect(r.shell.selected, BottomDestination.settings);
  });

  fakeTest('TC-NAV-016 게스트가 기록 탭을 누르면 탭이 바뀌지 않고 토스트이며 API는 0건이다', (async) {
    final r = HomeRig(guest: true);
    r.shell.start();
    r.shell.selectTab(BottomDestination.record);
    settle(async);
    expect(r.shell.selected, BottomDestination.home);
    expect(r.toast.messages, [Copy.navGuestRecord]);
    expect(r.api.totalCalls, 0);
  });

  fakeTest('TC-NAV-012 REQ-NAV-012 게스트도 전시·설정 탭은 열 수 있다', (async) {
    final r = HomeRig(guest: true);
    r.shell.start();
    r.shell.selectTab(BottomDestination.display);
    expect(r.shell.selected, BottomDestination.display);
    r.shell.selectTab(BottomDestination.settings);
    expect(r.shell.selected, BottomDestination.settings);
    expect(r.toast.messages, isEmpty);
  });

  fakeTest('TC-NAV-024 정지 회원도 모든 탭을 열 수 있다(제한은 쓰기 403 지점에서만)', (async) {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__403-banned.json')]);
    r.shell.start();
    for (final tab in BottomDestination.values) {
      r.shell.selectTab(tab);
      expect(r.shell.selected, tab);
    }
    expect(r.toast.messages, isEmpty);
  });

  fakeTest('TC-NAV-050 새 셸은 항상 홈으로 시작하고 이전 선택·대상 상태가 없다', (async) {
    final a = HomeRig();
    a.shell.start();
    a.shell.selectTab(BottomDestination.settings);
    a.shell.openDisplay(date: const KstDate(2026, 10, 26), popular: true);
    final b = HomeRig();
    b.shell.start();
    expect(b.shell.selected, BottomDestination.home);
    expect(b.shell.recordTarget, isNull);
    expect(b.shell.displayTarget, isNull);
  });

  group('업로드 버튼', () {
    fakeTest(
      'TC-NAV-005 인증 사용자: 선택 탭은 그대로이고 GET /posts/today가 호출되며 통과하면 업로드 이동이다',
      (async) {
        final r = HomeRig();
        r.api.today([fx('home/posts-today__not-posted.json')]);
        r.shell.start();
        r.shell.selectTab(BottomDestination.display);
        r.shell.onUploadPressed();
        advance(async, _wait);
        expect(r.shell.selected, BottomDestination.display);
        expect(r.api.todayCalls, 1);
        expect(
          r.shellEvents.whereType<NavigateToUpload>().single.topicDate,
          const KstDate(2026, 10, 27),
        );
        expect(r.analytics.destinations, [
          'display',
        ], reason: '업로드 버튼은 분석 이벤트를 보내지 않는다');
        expect(r.shell.isCheckingUpload, isFalse);
      },
    );

    fakeTest('TC-NAV-007 확인 중 연타해도 GET /posts/today는 1회이고 업로드 이동도 1건이다', (
      async,
    ) {
      final r = HomeRig();
      r.api.today([
        fx(
          'home/posts-today__not-posted.json',
          delay: const Duration(seconds: 1),
        ),
      ]);
      r.shell.start();
      r.shell.onUploadPressed();
      r.shell.onUploadPressed();
      r.shell.onUploadPressed();
      settle(async);
      expect(r.shell.isCheckingUpload, isTrue);
      advance(async, _wait);
      expect(r.api.todayCalls, 1);
      expect(r.shellEvents.whereType<NavigateToUpload>(), hasLength(1));
      expect(r.shell.isCheckingUpload, isFalse);
    });

    fakeTest('TC-NAV-017 게스트는 /posts/today 0건이고 토스트, 업로드 이동 없음', (async) {
      final r = HomeRig(guest: true);
      r.shell.start();
      r.shell.onUploadPressed();
      settle(async);
      expect(r.toast.messages, [Copy.navGuestUpload]);
      expect(r.api.todayCalls, 0);
      expect(r.api.totalCalls, 0);
      expect(r.shellEvents, isEmpty);
    });

    fakeTest('D-14 이미 작성/주제 없음/정지/확인 실패는 해당 문구 토스트이고 이동하지 않는다', (async) {
      final cases = {
        'home/posts-today__posted-approved.json': Copy.uploadGateAlreadyPosted,
        'home/posts-today__404-no-open-topic.json': Copy.uploadGateNoTopic,
        'home/posts-today__403-banned.json': Copy.uploadGateBanned,
        'home/posts-today__500-server-error.json': Copy.uploadGateCheckFailed,
      };
      for (final e in cases.entries) {
        final r = HomeRig();
        r.api.today([fx(e.key)]);
        r.shell.start();
        r.shell.onUploadPressed();
        advance(async, _wait);
        expect(r.toast.messages, [e.value], reason: e.key);
        expect(
          r.shellEvents.whereType<NavigateToUpload>(),
          isEmpty,
          reason: e.key,
        );
        expect(r.shell.isCheckingUpload, isFalse, reason: e.key);
      }
    });

    fakeTest('TC-NAV-036 게이트 401(갱신 후에도)은 로그인 화면으로 보낸다', (async) {
      final r = HomeRig();
      r.api.today([fx('home/posts-today__401-unauthorized.json')]);
      r.http.adapter.on('POST', '$v1/auth/refresh', [
        fx('auth/refresh__reauthentication-required.json'),
      ]);
      r.shell.start();
      r.shell.onUploadPressed();
      advance(async, _wait);
      expect(r.shellEvents.whereType<NavigateToLogin>(), hasLength(1));
    });

    fakeTest('게이트가 끝나면 다시 눌러 새로 확인할 수 있다', (async) {
      final r = HomeRig();
      r.api.today([fx('home/posts-today__posted-approved.json')]);
      r.shell.start();
      r.shell.onUploadPressed();
      advance(async, _wait);
      r.shell.onUploadPressed();
      advance(async, _wait);
      expect(r.api.todayCalls, 2);
    });
  });

  group('홈에서 다른 탭으로', () {
    fakeTest('TC-HOME-031 기록 탭 열기: 탭이 바뀌고 날짜 대상이 한 번만 전달된다', (async) {
      final r = HomeRig();
      r.shell.start();
      r.shell.openRecord(date: const KstDate(2026, 9, 30));
      expect(r.shell.selected, BottomDestination.record);
      expect(r.shell.recordTarget?.date, const KstDate(2026, 9, 30));
      expect(r.shell.takeRecordTarget()?.date, const KstDate(2026, 9, 30));
      expect(r.shell.takeRecordTarget(), isNull);
    });

    fakeTest('TC-HOME-023 전시 탭 열기: 탭이 바뀌고 날짜·인기순 대상이 전달된다', (async) {
      final r = HomeRig();
      r.shell.start();
      r.shell.openDisplay(date: const KstDate(2026, 10, 26), popular: true);
      expect(r.shell.selected, BottomDestination.display);
      final target = r.shell.takeDisplayTarget()!;
      expect(target.date, const KstDate(2026, 10, 26));
      expect(target.popular, isTrue);
      expect(r.shell.takeDisplayTarget(), isNull);
    });

    fakeTest('게스트는 기록 탭 열기도 막힌다(토스트, 탭 유지)', (async) {
      final r = HomeRig(guest: true);
      r.shell.start();
      r.shell.openRecord();
      expect(r.shell.selected, BottomDestination.home);
      expect(r.toast.messages, [Copy.navGuestRecord]);
    });
  });
}
