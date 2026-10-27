import { LatestRequestGuard } from './LatestRequestGuard';
import { deferred } from './__testing__/FakeTransport';

describe('LatestRequestGuard', () => {
  it('TC-NET-056 느린 A 뒤에 빠른 B가 오면 A가 나중에 끝나도 stale이고 B만 반영된다', async () => {
    const guard = new LatestRequestGuard();
    const slow = deferred<string>();
    const a = guard.run(() => slow.promise);
    const b = guard.run(async () => 'B');
    expect(await b).toEqual({ status: 'applied', value: 'B' });
    slow.resolve('A');
    expect(await a).toEqual({ status: 'stale' });
  });

  it('TC-NET-056 새 run은 이전 요청의 signal을 abort한다', async () => {
    const guard = new LatestRequestGuard();
    let first: AbortSignal | undefined;
    void guard.run((signal) => {
      first = signal;
      return new Promise<string>(() => undefined);
    });
    void guard.run(async () => 'B');
    expect(first?.aborted).toBe(true);
  });

  it('TC-NET-056 이전 요청이 취소로 reject해도 stale로 삼키고 던지지 않는다', async () => {
    const guard = new LatestRequestGuard();
    const a = guard.run(
      (signal) =>
        new Promise<string>((_res, rej) =>
          signal.addEventListener('abort', () => rej(new Error('aborted'))),
        ),
    );
    await guard.run(async () => 'B');
    expect(await a).toEqual({ status: 'stale' });
  });

  it('최신 요청의 실제 오류는 그대로 던진다', async () => {
    const guard = new LatestRequestGuard();
    await expect(
      guard.run(async () => {
        throw new Error('real');
      }),
    ).rejects.toThrow('real');
  });

  it('TC-NET-057 invalidate 뒤에 도착한 응답은 stale이다(화면 이탈·계정 전환)', async () => {
    const guard = new LatestRequestGuard();
    const pending = deferred<string>();
    const call = guard.run(() => pending.promise);
    guard.invalidate();
    pending.resolve('late');
    expect(await call).toEqual({ status: 'stale' });
  });
});
