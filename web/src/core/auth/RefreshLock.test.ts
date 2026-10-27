import { InProcessRefreshLock, REFRESH_LOCK_NAME, WebLocksRefreshLock } from './RefreshLock';

describe('InProcessRefreshLock', () => {
  it('들어온 순서대로 하나씩 실행한다', async () => {
    const lock = new InProcessRefreshLock();
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const a = lock.withLock(async () => {
      log.push('a start');
      await gate;
      log.push('a end');
    });
    const b = lock.withLock(async () => {
      log.push('b');
    });
    await Promise.resolve();
    expect(log).toEqual(['a start']);
    release();
    await Promise.all([a, b]);
    expect(log).toEqual(['a start', 'a end', 'b']);
  });

  it('앞선 작업이 실패해도 다음 작업은 실행되고, 실패는 그 호출자에게만 전달된다', async () => {
    const lock = new InProcessRefreshLock();
    const failed = lock.withLock(() => Promise.reject(new Error('boom')));
    const next = lock.withLock(() => Promise.resolve('ok'));
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});

describe('WebLocksRefreshLock', () => {
  it('Web Locks API가 있으면 chalkak-auth-refresh 이름으로 요청한다', async () => {
    const names: string[] = [];
    const locks = {
      request<T>(name: string, callback: () => Promise<T>): Promise<T> {
        names.push(name);
        return callback();
      },
    };
    await expect(new WebLocksRefreshLock(locks).withLock(() => Promise.resolve(7))).resolves.toBe(7);
    expect(names).toEqual([REFRESH_LOCK_NAME]);
    expect(REFRESH_LOCK_NAME).toBe('chalkak-auth-refresh');
  });

  it('지원하지 않으면 탭 안 뮤텍스로 폴백한다', async () => {
    const lock = new WebLocksRefreshLock(undefined);
    const log: number[] = [];
    await Promise.all([1, 2, 3].map((n) => lock.withLock(async () => void log.push(n))));
    expect(log).toEqual([1, 2, 3]);
  });
});
