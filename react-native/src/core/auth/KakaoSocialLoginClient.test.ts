import { KakaoSdkCancelledError, KakaoSdkConfigError } from './KakaoSdk';
import { KakaoSocialLoginClient } from './KakaoSocialLoginClient';
import { SocialLoginError } from './SocialLoginClient';
import { FakeKakaoSdk } from './__testing__/FakeKakaoSdk';

function setup() {
  const sdk = new FakeKakaoSdk();
  return { sdk, client: new KakaoSocialLoginClient(sdk) };
}

describe('KakaoSocialLoginClient', () => {
  it('TC-AUTH-014 카카오톡 로그인이 가능하면 톡 로그인을 먼저 쓰고 해시 nonce를 그대로 넘긴다', async () => {
    const { sdk, client } = setup();
    const result = await client.login('hash-1');
    expect(result).toEqual({ kind: 'success', idToken: 'talk-id-token' });
    expect(sdk.calls).toEqual(['isTalkAvailable', 'loginWithTalk']);
    expect(sdk.nonces).toEqual(['hash-1']);
  });

  it('TC-AUTH-015 톡 로그인이 취소 아닌 이유로 실패하면 카카오계정 로그인으로 폴백한다(같은 nonce)', async () => {
    const { sdk, client } = setup();
    sdk.talkResult = new Error('talk failed');
    const result = await client.login('hash-1');
    expect(result).toEqual({ kind: 'success', idToken: 'account-id-token' });
    expect(sdk.calls).toEqual(['isTalkAvailable', 'loginWithTalk', 'loginWithAccount']);
    expect(sdk.nonces).toEqual(['hash-1', 'hash-1']);
  });

  it('TC-AUTH-016 톡 로그인에서 사용자가 취소하면 계정 로그인으로 폴백하지 않고 cancelled를 돌려준다', async () => {
    const { sdk, client } = setup();
    sdk.talkResult = new KakaoSdkCancelledError('cancel');
    await expect(client.login('hash-1')).resolves.toEqual({ kind: 'cancelled' });
    expect(sdk.calls).not.toContain('loginWithAccount');
  });

  it('TC-AUTH-013 카카오계정 로그인에서 취소해도 cancelled이며 오류가 아니다', async () => {
    const { sdk, client } = setup();
    sdk.talkAvailable = false;
    sdk.accountResult = new KakaoSdkCancelledError('cancel');
    await expect(client.login('hash-1')).resolves.toEqual({ kind: 'cancelled' });
  });

  it('TC-AUTH-017 카카오톡이 없으면 계정 로그인을 쓴다', async () => {
    const { sdk, client } = setup();
    sdk.talkAvailable = false;
    await expect(client.login('hash-1')).resolves.toEqual({
      kind: 'success',
      idToken: 'account-id-token',
    });
    expect(sdk.calls).toEqual(['isTalkAvailable', 'loginWithAccount']);
  });

  it('TC-AUTH-017 톡 가용성 확인이 실패해도 계정 로그인을 쓴다', async () => {
    const { sdk, client } = setup();
    sdk.talkAvailable = new Error('availability check failed');
    await expect(client.login('hash-1')).resolves.toEqual({
      kind: 'success',
      idToken: 'account-id-token',
    });
    expect(sdk.calls).not.toContain('loginWithTalk');
  });

  it('TC-AUTH-018 SDK가 idToken 없이 성공하면 config 오류다', async () => {
    const { sdk, client } = setup();
    sdk.talkResult = { idToken: null };
    await expect(client.login('hash-1')).rejects.toMatchObject({
      name: 'SocialLoginError',
      reason: 'config',
    });
    // 빈 문자열도 없는 것과 같다.
    sdk.talkResult = { idToken: '' };
    await expect(client.login('hash-1')).rejects.toBeInstanceOf(SocialLoginError);
  });

  it('TC-AUTH-018 카카오 설정 누락(KakaoSdkConfigError)은 폴백 없이 config 오류다', async () => {
    const { sdk, client } = setup();
    sdk.talkResult = new KakaoSdkConfigError('app key missing');
    await expect(client.login('hash-1')).rejects.toMatchObject({ reason: 'config' });
    expect(sdk.calls).not.toContain('loginWithAccount');
  });

  it('TC-AUTH-019 톡·계정 모두 일반 실패하면 failed 오류다', async () => {
    const { sdk, client } = setup();
    sdk.talkResult = new Error('talk failed');
    sdk.accountResult = new Error('account failed');
    await expect(client.login('hash-1')).rejects.toMatchObject({ reason: 'failed' });
  });
});
