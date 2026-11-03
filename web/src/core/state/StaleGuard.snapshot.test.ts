import { StaleGuard } from './StaleGuard';

describe('StaleGuard.snapshot (코드리뷰 7)', () => {
  it('snapshot 티켓은 여러 개가 함께 유효하고 begin()으로 무효화되지 않는 한 같은 세대다', () => {
    const guard = new StaleGuard();
    const a = guard.snapshot();
    const b = guard.snapshot();
    expect([a.isCurrent(), b.isCurrent()]).toEqual([true, true]);
  });

  it('invalidate()는 이전 snapshot 티켓을 모두 무효로 하고 새 snapshot은 유효하다', () => {
    const guard = new StaleGuard();
    const old = guard.snapshot();
    guard.invalidate();
    expect(old.isCurrent()).toBe(false);
    expect(guard.snapshot().isCurrent()).toBe(true);
  });

  it('begin()은 이전 snapshot을 무효로 한다(세대가 바뀐다)', () => {
    const guard = new StaleGuard();
    const snap = guard.snapshot();
    guard.begin();
    expect(snap.isCurrent()).toBe(false);
  });
});
