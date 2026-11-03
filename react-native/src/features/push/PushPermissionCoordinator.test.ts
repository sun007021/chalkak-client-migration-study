import { FakePushPermissionGateway } from '../../core/push/__testing__/FakePushPermissionGateway';
import { FakePushPromptFlagStore } from '../../core/push/__testing__/FakePushPromptFlagStore';
import { FakeToastPresenter } from '../../core/toast/__testing__/FakeToastPresenter';
import { t } from '../../shared/copy';
import { createBootHarness } from '../boot/__testing__/createBootHarness';
import { PushPermissionCoordinator } from './PushPermissionCoordinator';
import type { PushPermissionStatus } from '../../core/push/PushPermissionGateway';

function setup(initial: PushPermissionStatus = 'undetermined', requested = false) {
  const boot = createBootHarness();
  const gateway = new FakePushPermissionGateway(initial);
  const flags = new FakePushPromptFlagStore(requested);
  const toast = new FakeToastPresenter();
  const coordinator = new PushPermissionCoordinator({
    boot: boot.viewModel,
    gateway,
    flags,
    toast,
  });
  const stop = coordinator.start();
  return { boot: boot.viewModel, gateway, flags, toast, coordinator, stop };
}
const settle = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

describe('PushPermissionCoordinator', () => {
  it('TC-PUSH-001 인증 사용자가 메인에 처음 들어오면 OS 권한 요청을 1회만 호출하고 요청함을 저장한다', async () => {
    const h = setup();
    h.boot.toMain('member');
    await settle();
    expect(h.gateway.requestCalls).toBe(1);
    expect(h.flags.requested).toBe(true);
    h.boot.toMain('member');
    await settle();
    expect(h.gateway.requestCalls).toBe(1);
  });

  it('TC-PUSH-009 요청함 표시가 있으면(앱 재시작 포함) 다시 요청하지 않는다', async () => {
    const h = setup('undetermined', true);
    h.boot.toMain('member');
    await settle();
    expect(h.gateway.requestCalls).toBe(0);
  });

  it.each(['granted', 'denied'] as const)(
    'REQ-PUSH-004 이미 %s로 결정된 상태면 대화상자 없이 요청함 표시만 저장한다',
    async (status) => {
      const h = setup(status);
      h.boot.toMain('member');
      await settle();
      expect(h.gateway.requestCalls).toBe(0);
      expect(h.flags.requested).toBe(true);
    },
  );

  it('TC-PUSH-004 REQ-PUSH-002 게스트·로그인·가입·스플래시 단계에서는 요청하지 않는다', async () => {
    const h = setup();
    await settle();
    h.boot.toLogin();
    h.boot.toSignUp({ idToken: 'i', rawNonce: 'n' });
    h.boot.toMain('guest');
    await settle();
    expect(h.gateway.requestCalls).toBe(0);
    expect(h.flags.requested).toBe(false);
  });

  it('TC-PUSH-010 TC-PUSH-011 가입 완료 직후 첫 메인 진입과 다른 계정 로그인 모두 같은 규칙(기기 단위 1회)을 따른다', async () => {
    const h = setup();
    h.boot.toSignUp({ idToken: 'i', rawNonce: 'n' });
    h.boot.toMain('member');
    await settle();
    expect(h.gateway.requestCalls).toBe(1);
    h.boot.toLogin();
    h.boot.toMain('member');
    await settle();
    expect(h.gateway.requestCalls).toBe(1);
  });

  it('REQ-PUSH-005 권한 결과(허용·거부)와 상관없이 서버 설정을 바꾸지 않는다(코디네이터는 설정 API 의존성이 없다)', async () => {
    const h = setup();
    h.gateway.resultOnRequest = 'denied';
    h.boot.toMain('member');
    await settle();
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-PUSH-007 REQ-PUSH-006 요청 호출이 실패하면 noti.perm.error 토스트를 보이고 요청함 표시는 저장한다', async () => {
    const h = setup();
    h.gateway.failRequest = true;
    h.boot.toMain('member');
    await settle();
    expect(h.toast.messages).toEqual([t('noti.perm.error')]);
    expect(h.flags.requested).toBe(true);
  });

  it('요청함 표시 저장(markRequested)만 실패하면 토스트 없이 권한은 요청한다', async () => {
    const h = setup();
    h.flags.markRequested = async () => {
      throw new Error('storage');
    };
    h.boot.toMain('member');
    await settle();
    expect(h.toast.messages).toEqual([]);
    expect(h.gateway.requestCalls).toBe(1);
  });

  it('stop 뒤 다시 start해도 이 프로세스에서는 한 번만 요청한다', async () => {
    const h = setup();
    h.boot.toMain('member');
    await settle();
    h.stop();
    h.coordinator.start();
    await settle();
    expect(h.gateway.requestCalls).toBe(1);
  });

  it('stop 뒤에는 요청하지 않는다', async () => {
    const h = setup();
    h.stop();
    h.boot.toMain('member');
    await settle();
    expect(h.gateway.requestCalls).toBe(0);
  });

  it('이미 member 메인인 상태에서 시작해도(콜드 스타트 복귀) 한 번 요청한다', async () => {
    const boot = createBootHarness();
    boot.viewModel.toMain('member');
    const gateway = new FakePushPermissionGateway('undetermined');
    new PushPermissionCoordinator({
      boot: boot.viewModel,
      gateway,
      flags: new FakePushPromptFlagStore(false),
      toast: new FakeToastPresenter(),
    }).start();
    await settle();
    expect(gateway.requestCalls).toBe(1);
  });
});
