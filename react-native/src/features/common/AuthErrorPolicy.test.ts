import {
  AuthenticationRequiredError,
  HttpError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import { AuthErrorPolicy } from './AuthErrorPolicy';

function setup() {
  const calls: string[] = [];
  return { calls, policy: new AuthErrorPolicy({ toLogin: () => void calls.push('login') }) };
}

describe('AuthErrorPolicy', () => {
  it('ReauthenticationRequiredError는 처리된 것으로 보되 로그인으로 보내지 않는다(session-expired 이벤트의 몫)', () => {
    const { calls, policy } = setup();
    expect(policy.handle(new ReauthenticationRequiredError('reauth'))).toBe(true);
    expect(calls).toEqual([]);
  });

  it('AuthenticationRequiredError는 로그인으로 보내되 같은 key에서는 한 번만 보낸다', () => {
    const { calls, policy } = setup();
    expect(policy.handle(new AuthenticationRequiredError('401'), 1)).toBe(true);
    expect(policy.handle(new AuthenticationRequiredError('401'), 1)).toBe(true);
    expect(calls).toEqual(['login']);
    policy.handle(new AuthenticationRequiredError('401'), 2);
    expect(calls).toEqual(['login', 'login']);
  });

  it('그 밖의 오류는 처리하지 않는다', () => {
    const { calls, policy } = setup();
    expect(policy.handle(new HttpError(500, null, null))).toBe(false);
    expect(policy.handle(new Error('x'))).toBe(false);
    expect(calls).toEqual([]);
  });
});
