import { UserDataCacheRegistry } from './UserDataCacheRegistry';

describe('UserDataCacheRegistry', () => {
  it('등록된 캐시를 모두 비운다', async () => {
    const registry = new UserDataCacheRegistry();
    const a = { clearAll: jest.fn() };
    const b = { clearAll: jest.fn(async () => {}) };
    registry.register(a);
    registry.register(b);
    await registry.clearAll();
    expect(a.clearAll).toHaveBeenCalledTimes(1);
    expect(b.clearAll).toHaveBeenCalledTimes(1);
  });

  it('해제한 캐시는 비우지 않는다', async () => {
    const registry = new UserDataCacheRegistry();
    const a = { clearAll: jest.fn() };
    registry.register(a)();
    await registry.clearAll();
    expect(a.clearAll).not.toHaveBeenCalled();
  });

  it('한 캐시가 실패해도 나머지를 비우고 첫 오류를 던진다', async () => {
    const registry = new UserDataCacheRegistry();
    const boom = new Error('boom');
    const failing = {
      clearAll: jest.fn(() => {
        throw boom;
      }),
    };
    const ok = { clearAll: jest.fn() };
    registry.register(failing);
    registry.register(ok);
    await expect(registry.clearAll()).rejects.toBe(boom);
    expect(ok.clearAll).toHaveBeenCalledTimes(1);
  });
});
