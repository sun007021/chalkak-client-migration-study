import { readFeatureFlags } from '../config/FeatureFlags';
import { FixtureSocialLoginClient } from './FixtureSocialLoginClient';
import { selectSocialLoginClient } from './selectSocialLoginClient';
import { FakeSocialLoginClient } from './__testing__/FakeSocialLoginClient';

describe('E2E 카카오 클라이언트 선택 지점(strategy §2)', () => {
  it('e2eKakaoIdToken이 있으면 SDK를 거치지 않고 fixture idToken을 돌려준다', async () => {
    const real = new FakeSocialLoginClient();
    const flags = readFeatureFlags({ appVariant: 'e2e', e2eKakaoIdToken: 'fixture-id-token' });
    const client = selectSocialLoginClient(flags, real);
    await expect(client.login('hash-1')).resolves.toEqual({
      kind: 'success',
      idToken: 'fixture-id-token',
    });
    expect(real.nonceHashes).toEqual([]);
  });

  it.each([
    ['appVariant 없음', { e2eKakaoIdToken: 'fixture-id-token' }],
    ['appVariant가 e2e가 아님', { appVariant: 'production', e2eKakaoIdToken: 'fixture-id-token' }],
    ['e2e지만 토큰 없음', { appVariant: 'e2e' }],
  ])('%s이면 토큰이 있어도 Fake로 우회하지 않고 실제 클라이언트를 쓴다', (_label, extra) => {
    const real = new FakeSocialLoginClient();
    expect(selectSocialLoginClient(readFeatureFlags(extra), real)).toBe(real);
  });

  it('값이 없으면 실제 클라이언트를 그대로 쓴다', () => {
    const real = new FakeSocialLoginClient();
    expect(selectSocialLoginClient(readFeatureFlags(undefined), real)).toBe(real);
  });

  it('FixtureSocialLoginClient는 nonce와 무관하게 고정 idToken을 돌려준다', async () => {
    const client = new FixtureSocialLoginClient('tok');
    await expect(client.login('a')).resolves.toEqual({ kind: 'success', idToken: 'tok' });
    await expect(client.login('b')).resolves.toEqual({ kind: 'success', idToken: 'tok' });
  });
});
