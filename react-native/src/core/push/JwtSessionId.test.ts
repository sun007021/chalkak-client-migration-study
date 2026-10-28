import { loadFixture } from '../http/__testing__/loadFixture';
import { hasSessionId } from './JwtSessionId';

type Case = { token: string; expect: { hasSessionId: boolean } };
type Malformed = { cases: { name: string; token: string }[]; expect: { hasSessionId: boolean } };

describe('hasSessionId', () => {
  it('TC-PUSH-022 session_id 클레임이 있는 JWT는 true', () => {
    const c = loadFixture<Case>('push/jwt__with-session-id');
    expect(hasSessionId(c.token)).toBe(c.expect.hasSessionId);
  });

  it('TC-PUSH-023 session_id 클레임이 없는 JWT는 false', () => {
    const c = loadFixture<Case>('push/jwt__without-session-id');
    expect(hasSessionId(c.token)).toBe(c.expect.hasSessionId);
  });

  it('TC-PUSH-026 잘못된 형식은 예외 없이 false(서명 검증은 하지 않는다)', () => {
    const c = loadFixture<Malformed>('push/jwt__malformed');
    for (const item of c.cases) {
      expect({ name: item.name, value: hasSessionId(item.token) }).toEqual({
        name: item.name,
        value: c.expect.hasSessionId,
      });
    }
  });
});
