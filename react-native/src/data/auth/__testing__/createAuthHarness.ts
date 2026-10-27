import { createNetHarness } from '../../../core/http/__testing__/createNetHarness';
import { fixtureResponse } from '../../../core/http/__testing__/loadFixture';
import { FakePushRegistrar } from '../../../core/push/__testing__/FakePushRegistrar';
import { FakeUserDataCache } from '../../../core/push/__testing__/FakeUserDataCache';
import { AuthRepository } from '../AuthRepository';

/** NET 하네스(Fake transport·저장소·시계) 위에 AuthRepository와 캐시·푸시 Fake를 얹는다. */
export function createAuthHarness() {
  const net = createNetHarness();
  const cache = new FakeUserDataCache();
  const push = new FakePushRegistrar();
  const repository = new AuthRepository({
    api: net.api,
    sessionStore: net.sessionStore,
    clock: net.clock,
    caches: [cache],
    pushRegistrar: push,
  });

  /** 요청 경로(`/auth/social-login` 등)별로 fixture 응답을 돌려준다. 정해지지 않은 경로는 오류. */
  function routes(table: Record<string, string>): void {
    net.transport.respond((request) => {
      const path = new URL(request.url).pathname.replace('/api/v1', '');
      const fixture = table[`${request.method} ${path}`];
      if (!fixture) throw new Error(`예상하지 못한 요청 ${request.method} ${path}`);
      return fixtureResponse(fixture);
    });
  }

  return { ...net, cache, push, repository, routes };
}

export type AuthHarness = ReturnType<typeof createAuthHarness>;
