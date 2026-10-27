import { StaleGuard } from './StaleGuard';

describe('StaleGuard', () => {
  it('TC-NET-056 느린 요청 A 뒤에 시작한 빠른 요청 B가 있으면 A의 응답은 버려진다', async () => {
    const guard = new StaleGuard();
    const applied: string[] = [];
    let resolveA!: (v: string) => void;
    const slowA = new Promise<string>((r) => (resolveA = r));

    const ticketA = guard.begin();
    const a = slowA.then((v) => {
      if (ticketA.isCurrent()) applied.push(v);
    });
    const ticketB = guard.begin();
    const b = Promise.resolve('B').then((v) => {
      if (ticketB.isCurrent()) applied.push(v);
    });
    await b;
    resolveA('A');
    await a;
    expect(applied).toEqual(['B']);
    expect(ticketA.isCurrent()).toBe(false);
    expect(ticketB.isCurrent()).toBe(true);
  });

  it('TC-NET-057 TC-AUTH-042 계정 전환(invalidate) 전에 시작한 요청의 응답은 전환 뒤 반영되지 않는다', () => {
    const guard = new StaleGuard();
    const accountA = guard.begin();
    guard.invalidate();
    expect(accountA.isCurrent()).toBe(false);
    const accountB = guard.begin();
    expect(accountB.isCurrent()).toBe(true);
  });

  it('TC-NET-056 새 요청이 없으면 티켓은 계속 유효하다', () => {
    const guard = new StaleGuard();
    const t = guard.begin();
    expect(t.isCurrent()).toBe(true);
    expect(t.isCurrent()).toBe(true);
  });
});
