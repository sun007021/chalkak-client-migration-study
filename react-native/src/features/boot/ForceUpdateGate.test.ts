import { ForceUpdateGate } from './ForceUpdateGate';
import { FakeUpdateChecker } from './__testing__/fakes';

describe('ForceUpdateGate', () => {
  it('TC-BOOT-032 설정으로 꺼져 있으면 조회를 한 번도 하지 않고 통과한다', async () => {
    const checker = new FakeUpdateChecker('update-required');
    const gate = new ForceUpdateGate(checker, false);
    await gate.check();
    expect(checker.calls).toBe(0);
    expect(gate.getSnapshot().blocked).toBe(false);
  });

  it('TC-BOOT-016 업데이트가 필요하다고 판정되면 blocked다', async () => {
    const gate = new ForceUpdateGate(new FakeUpdateChecker('update-required'), true);
    await gate.check();
    expect(gate.getSnapshot().blocked).toBe(true);
  });

  it('TC-BOOT-018 up-to-date면 통과한다', async () => {
    const gate = new ForceUpdateGate(new FakeUpdateChecker('up-to-date'), true);
    await gate.check();
    expect(gate.getSnapshot().blocked).toBe(false);
  });

  it('TC-BOOT-023 조회 실패(unavailable)와 검사기 예외는 통과다', async () => {
    const gate = new ForceUpdateGate(new FakeUpdateChecker('unavailable'), true);
    await gate.check();
    expect(gate.getSnapshot().blocked).toBe(false);

    const throwing = new ForceUpdateGate(new FakeUpdateChecker(new Error('boom')), true);
    await expect(throwing.check()).resolves.toBeUndefined();
    expect(throwing.getSnapshot().blocked).toBe(false);
  });

  it('TC-BOOT-025 오프라인(unavailable)이면 통과하고, 온라인 전환 뒤 재조회에서 강제 대상이면 blocked가 된다', async () => {
    const gate = new ForceUpdateGate(new FakeUpdateChecker('unavailable', 'update-required'), true);
    await gate.check();
    expect(gate.getSnapshot().blocked).toBe(false);
    await gate.check();
    expect(gate.getSnapshot().blocked).toBe(true);
  });

  it('TC-BOOT-027 앱이 다시 활성화되어 재확인했을 때 새로 강제 대상이면 blocked가 된다', async () => {
    const gate = new ForceUpdateGate(new FakeUpdateChecker('up-to-date', 'update-required'), true);
    await gate.check();
    expect(gate.getSnapshot().blocked).toBe(false);
    await gate.check();
    expect(gate.getSnapshot().blocked).toBe(true);
  });

  it('TC-BOOT-026 이미 blocked면 이후 재조회가 unavailable이어도 유지한다', async () => {
    const gate = new ForceUpdateGate(new FakeUpdateChecker('update-required', 'unavailable'), true);
    await gate.check();
    await gate.check();
    expect(gate.getSnapshot().blocked).toBe(true);
  });

  it('TC-BOOT-026 이미 blocked면 up-to-date를 받아도 앱 안에서는 풀지 않는다(재실행으로만 해제)', async () => {
    const gate = new ForceUpdateGate(new FakeUpdateChecker('update-required', 'up-to-date'), true);
    await gate.check();
    await gate.check();
    expect(gate.getSnapshot().blocked).toBe(true);
  });

  it('blocked 변화는 구독자에게 한 번 알린다', async () => {
    const gate = new ForceUpdateGate(new FakeUpdateChecker('update-required'), true);
    const listener = jest.fn();
    gate.subscribe(listener);
    await gate.check();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
