import 'package:chalkak/core/constants/app_constants.dart';
import 'package:chalkak/core/ui/toast/toast_controller.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';

void main() {
  const justBefore = Duration(milliseconds: 2499);
  const one = Duration(milliseconds: 1);

  test('토스트 지속 시간은 TOAST_DURATION(2.5초)이다', () {
    expect(ToastController().duration, AppConstants.toastDuration);
    expect(AppConstants.toastDuration, const Duration(milliseconds: 2500));
  });

  fakeTest('TC-NAV-025 토스트는 2.49초까지 보이고 2.5초에 사라진다', (async) {
    final toast = ToastController();
    toast.show('안녕');
    expect(toast.current?.text, '안녕');
    async.elapse(justBefore);
    expect(toast.current?.text, '안녕', reason: '2.49초');
    async.elapse(one);
    expect(toast.current, isNull, reason: '2.5초');
  });

  fakeTest('TC-NAV-026 같은 문구를 연달아 요청하면 매번 새 토스트로 다시 보이고 지속 시간이 새로 시작된다', (
    async,
  ) {
    final toast = ToastController();
    toast.show('같은 문구');
    final first = toast.current!;
    async.elapse(const Duration(seconds: 1));
    toast.show('같은 문구');
    final second = toast.current!;
    expect(second.text, first.text);
    expect(second.id, isNot(first.id), reason: 'id가 달라야 다시 그려진다');

    async.elapse(justBefore);
    expect(toast.current?.id, second.id, reason: '첫 토스트의 만료 시각(2.5초)을 지나도 유지');
    async.elapse(one);
    expect(toast.current, isNull, reason: '두 번째 요청 후 2.5초');
  });

  fakeTest('TC-NAV-027 떠 있는 토스트를 다른 문구로 교체하면 이전 타이머가 새 문구를 일찍 지우지 않는다', (
    async,
  ) {
    final toast = ToastController();
    toast.show('A');
    async.elapse(const Duration(seconds: 2));
    toast.show('B');
    expect(toast.current?.text, 'B');
    async.elapse(const Duration(milliseconds: 500));
    expect(toast.current?.text, 'B', reason: 'A의 만료 시각(2.5초)');
    async.elapse(const Duration(milliseconds: 1999));
    expect(toast.current?.text, 'B', reason: 'B 요청 후 2.499초');
    async.elapse(one);
    expect(toast.current, isNull);
  });

  fakeTest('TC-NAV-028 화면이 보이지 않을 때의 요청은 표시하지도 쌓아 두지도 않는다', (async) {
    final toast = ToastController();
    toast.screenVisible = false;
    toast.show('숨김 중 요청');
    expect(toast.current, isNull);
    toast.screenVisible = true;
    expect(toast.current, isNull, reason: '다시 보여도 쌓여 있던 토스트가 나오지 않는다');
    async.elapse(const Duration(seconds: 5));
    expect(toast.current, isNull);
  });

  fakeTest('TC-NAV-028 토스트가 떠 있는 중 화면이 가려지면 즉시 지운다', (async) {
    final toast = ToastController();
    toast.show('떠 있음');
    toast.screenVisible = false;
    expect(toast.current, isNull);
  });

  fakeTest('토스트가 나타나고 사라질 때 리스너에 알린다', (async) {
    final toast = ToastController();
    var notified = 0;
    toast.addListener(() => notified++);
    toast.show('a');
    expect(notified, 1);
    async.elapse(const Duration(milliseconds: 2500));
    expect(notified, 2);
  });
}
