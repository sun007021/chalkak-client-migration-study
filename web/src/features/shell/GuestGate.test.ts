import { GuestGate } from './GuestGate';
import type { GuestRestriction } from './GuestGate';
import { ToastController } from '../../core/ui/ToastController';
import { t } from '../../copy/ko';
import type { CopyKey } from '../../copy/ko';
import { FakeClock } from '../../test/FakeClock';
import { SequentialIdGenerator } from '../../test/sequentialIds';

const ACTIONS: readonly [GuestRestriction, CopyKey, string][] = [
  ['record', 'nav.guest.record', '기록을 보려면 로그인이 필요해요'],
  ['upload', 'nav.guest.upload', '게시물을 추가하려면 로그인이 필요해요'],
  ['feed', 'nav.guest.feed', '게시물 피드를 보려면 로그인이 필요해요'],
  ['like', 'nav.guest.like', '좋아요를 누르려면 로그인이 필요해요'],
  ['notification', 'nav.guest.notification', '로그인 후 알림을 확인할 수 있어요'],
  ['feedback', 'nav.guest.feedback', '피드백을 보내려면 로그인이 필요해요'],
];

function setup() {
  const clock = new FakeClock();
  const toast = new ToastController({ clock, ids: new SequentialIdGenerator() });
  return { clock, toast, gate: new GuestGate({ toast }) };
}

describe('GuestGate (D-05 게스트 제한 판정)', () => {
  it.each(ACTIONS)('TC-NAV-023 게스트의 %s 동작은 거절하고 토스트 %s를 보인다', (action, key, text) => {
    const { gate, toast } = setup();
    expect(gate.requireMember('guest', action)).toBe(false);
    expect(toast.state.toast?.message).toBe(t(key));
    expect(toast.state.toast?.message).toBe(text);
  });

  it('TC-NAV-023 게스트 제한 6종이 모두 서로 다른 문구이다', () => {
    const messages = ACTIONS.map(([action]) => {
      const { gate, toast } = setup();
      gate.requireMember('guest', action);
      return toast.state.toast?.message;
    });
    expect(new Set(messages).size).toBe(6);
  });

  it.each(ACTIONS)('TC-NAV-024 회원의 %s 동작은 통과하고 토스트가 없다(정지 회원도 셸은 회원과 같다. 제한은 서버 403 지점)', (action) => {
    const { gate, toast } = setup();
    expect(gate.requireMember('member', action)).toBe(true);
    expect(toast.state.toast).toBeNull();
  });

  it('TC-NAV-018 TC-NAV-019 TC-NAV-020 TC-NAV-022 피드·좋아요·알림·피드백 진입을 다른 화면이 같은 객체로 판정한다(화면 이동·요청은 호출한 쪽이 하지 않는다)', () => {
    const { gate } = setup();
    expect(gate.requireMember('guest', 'feed')).toBe(false);
    expect(gate.requireMember('guest', 'like')).toBe(false);
    expect(gate.requireMember('guest', 'notification')).toBe(false);
    expect(gate.requireMember('guest', 'feedback')).toBe(false);
  });

  it('TC-NAV-026 같은 제한을 연달아 눌러도 토스트가 매번 새로 보이고 2.5초 타이머가 다시 시작한다', async () => {
    const { gate, toast, clock } = setup();
    gate.requireMember('guest', 'record');
    const first = toast.state.toast!;
    await clock.advance(2_000);
    gate.requireMember('guest', 'record');
    const second = toast.state.toast!;
    expect(second.id).not.toBe(first.id);
    await clock.advance(2_000);
    expect(toast.state.toast?.id).toBe(second.id);
  });
});
