import { readFeatureFlags } from '../config/FeatureFlags';
import { FixtureSocialLoginClient } from './FixtureSocialLoginClient';
import { selectSocialLoginClient } from './selectSocialLoginClient';
import { FakeSocialLoginClient } from './__testing__/FakeSocialLoginClient';

describe('E2E 카카오 클라이언트 선택 지점(strategy §2)', () => {
  it('e2eKakaoIdToken이 있으면 SDK를 거치지 않고 fixture idToken을 돌려준다', async () => {
    const real = new FakeSocialLoginClient();
    const flags = readFeatureFlags({ e2eKakaoIdToken: 'fixture-id-token' });
    const client = selectSocialLoginClient(flags, real);
    await expect(client.login('hash-1')).resolves.toEqual({
      kind: 'success',
      idToken: 'fixture-id-token',
    });
    expect(real.nonceHashes).toEqual([]);
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
