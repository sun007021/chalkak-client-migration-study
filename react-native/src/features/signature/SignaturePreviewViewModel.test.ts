import {
  CancelledError,
  HttpError,
  NetworkError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import { deferred } from '../../core/http/__testing__/FakeTransport';
import { FakeToastPresenter } from '../../core/toast/__testing__/FakeToastPresenter';
import { t } from '../../shared/copy';
import { FakeAuthFlowNavigator } from '../auth/__testing__/FakeAuthFlowNavigator';
import type { SignatureMode } from './mapSignatureError';
import { SignaturePreviewViewModel } from './SignaturePreviewViewModel';
import { flush } from './__testing__/draw';
import { FakeSignatureSubmitter } from './__testing__/FakeSignatureSubmitter';

const PNG = new Uint8Array([1, 2, 3]);

function setup(mode: SignatureMode, submitter = new FakeSignatureSubmitter()) {
  const host = { onRedraw: jest.fn(), onRejected: jest.fn(), onCompleted: jest.fn() };
  const toast = new FakeToastPresenter();
  const navigator = new FakeAuthFlowNavigator();
  const vm = new SignaturePreviewViewModel({
    mode,
    png: PNG,
    submitter,
    host,
    authNavigator: navigator,
    toast,
  });
  return { vm, host, toast, navigator, submitter };
}

describe('SignaturePreviewViewModel', () => {
  it('REQ-ONB-012 confirm은 PNG와 취소 신호를 submitter에 넘기고 요청 중에는 busy, 성공하면 host.onCompleted를 한 번 부른다', async () => {
    const gate = deferred<void>();
    const { vm, host, submitter } = setup(
      'onboarding',
      new FakeSignatureSubmitter().holdUntil(gate.promise),
    );
    const pending = vm.confirm();
    expect(vm.getSnapshot().busy).toBe(true);
    expect(submitter.calls[0].png).toBe(PNG);
    expect(submitter.calls[0].signal.aborted).toBe(false);
    gate.resolve();
    await pending;
    expect(vm.getSnapshot()).toMatchObject({ busy: false, error: null });
    expect(host.onCompleted).toHaveBeenCalledTimes(1);
  });

  it.each<SignatureMode>(['onboarding', 'change'])(
    'TC-ONB-043/SIGN-036 %s: 확인을 3회 연타해도 요청은 한 번이다',
    async (mode) => {
      const gate = deferred<void>();
      const { vm, submitter, host } = setup(
        mode,
        new FakeSignatureSubmitter().holdUntil(gate.promise),
      );
      const calls = [vm.confirm(), vm.confirm(), vm.confirm()];
      gate.resolve();
      await Promise.all(calls);
      expect(submitter.calls).toHaveLength(1);
      expect(host.onCompleted).toHaveBeenCalledTimes(1);
    },
  );

  it('REQ-ONB-020 일반 실패면 오류를 올리고 미리보기에 머물며, 다시 누르면 처음부터 다시 요청한다', async () => {
    const { vm, host, submitter } = setup(
      'onboarding',
      new FakeSignatureSubmitter().script(new Error('boom'), 'ok'),
    );
    await vm.confirm();
    expect(vm.getSnapshot().busy).toBe(false);
    expect(vm.getSnapshot().error).toMatchObject({ message: t('onb.signup.error.generic') });
    expect(host.onCompleted).not.toHaveBeenCalled();
    expect(host.onRejected).not.toHaveBeenCalled();

    await vm.confirm();
    expect(submitter.calls).toHaveLength(2);
    expect(host.onCompleted).toHaveBeenCalledTimes(1);
  });

  it('REQ-ONB-020 같은 문구의 오류가 연달아 나도 id가 달라 새 알림이 된다', async () => {
    const { vm } = setup(
      'onboarding',
      new FakeSignatureSubmitter().script(new NetworkError('x'), new NetworkError('x')),
    );
    await vm.confirm();
    const first = vm.getSnapshot().error!;
    vm.dismissError();
    expect(vm.getSnapshot().error).toBeNull();
    await vm.confirm();
    expect(vm.getSnapshot().error!.id).toBeGreaterThan(first.id);
    expect(vm.getSnapshot().error!.message).toBe(first.message);
  });

  it('TC-ONB-035/SIGN-029 서버가 사인을 거절(400 BUSINESS_ERROR)하면 host.onRejected로 그리기에 돌려보내고 미리보기 오류는 없다', async () => {
    const { vm, host } = setup(
      'onboarding',
      new FakeSignatureSubmitter().script(
        new HttpError(400, 'BUSINESS_ERROR', '사용할 수 없는 사인 이미지입니다.'),
      ),
    );
    await vm.confirm();
    expect(host.onRejected).toHaveBeenCalledWith(t('sign.error.invalid'));
    expect(vm.getSnapshot().error).toBeNull();
    expect(vm.getSnapshot().busy).toBe(false);
  });

  it('TC-ONB-030 TC-ONB-033 401이면 toLogin + 토스트 sign.error.expired, 미리보기 오류는 없다', async () => {
    const { vm, navigator, toast } = setup(
      'onboarding',
      new FakeSignatureSubmitter().script(new HttpError(401, 'UNAUTHORIZED', null)),
    );
    await vm.confirm();
    expect(navigator.calls).toEqual(['login']);
    expect(toast.messages).toEqual([t('sign.error.expired')]);
    expect(vm.getSnapshot().error).toBeNull();
  });

  it('TC-ONB-032 가입 403이면 서버 message를 토스트로 보이고 로그인으로 보낸다', async () => {
    const { vm, navigator, toast } = setup(
      'onboarding',
      new FakeSignatureSubmitter().script(new HttpError(403, 'FORBIDDEN', '차단된 계정입니다.')),
    );
    await vm.confirm();
    expect(toast.messages).toEqual(['차단된 계정입니다.']);
    expect(navigator.calls).toEqual(['login']);
  });

  it('TC-SIGN-033 변경 모드 refresh 실패(ReauthenticationRequiredError)도 로그인 + sign.error.expired', async () => {
    const { vm, navigator, toast } = setup(
      'change',
      new FakeSignatureSubmitter().script(new ReauthenticationRequiredError('x')),
    );
    await vm.confirm();
    expect(navigator.calls).toEqual(['login']);
    expect(toast.messages).toEqual([t('sign.error.expired')]);
  });

  it('TC-SIGN-030 TC-SIGN-031 변경 모드 403은 auth.banned.signature 토스트만 보이고 미리보기에 머문다', async () => {
    const { vm, toast, navigator, host } = setup(
      'change',
      new FakeSignatureSubmitter().script(new HttpError(403, 'FORBIDDEN', '정지')),
    );
    await vm.confirm();
    expect(toast.messages).toEqual([t('auth.banned.signature')]);
    expect(vm.getSnapshot().error).toBeNull();
    expect(navigator.calls).toEqual([]);
    expect(host.onCompleted).not.toHaveBeenCalled();
    expect(vm.getSnapshot().busy).toBe(false);
  });

  it('TC-SIGN-034 변경 중 네트워크 오류는 sign.error.network를 보이고 미리보기·그린 사인을 유지한다', async () => {
    const { vm, host } = setup(
      'change',
      new FakeSignatureSubmitter().script(new NetworkError('offline')),
    );
    await vm.confirm();
    expect(vm.getSnapshot().error).toMatchObject({ message: t('sign.error.network') });
    expect(host.onRejected).not.toHaveBeenCalled();
    expect(vm.png).toBe(PNG);
  });

  it('TC-ONB-044/SIGN-037 dispose하면 진행 중 요청에 취소 신호를 보내고, 이후 도착한 결과는 이동·알림·토스트 모두 하지 않는다', async () => {
    const gate = deferred<void>();
    const { vm, host, toast, navigator, submitter } = setup(
      'onboarding',
      new FakeSignatureSubmitter().holdUntil(gate.promise),
    );
    const pending = vm.confirm();
    vm.dispose();
    expect(submitter.calls[0].signal.aborted).toBe(true);
    gate.resolve();
    await pending;
    await flush();
    expect(host.onCompleted).not.toHaveBeenCalled();
    expect(toast.messages).toEqual([]);
    expect(navigator.calls).toEqual([]);
  });

  it('TC-ONB-044 dispose 뒤 실패가 도착해도 아무것도 보이지 않는다', async () => {
    const gate = deferred<void>();
    const { vm, host, toast, navigator } = setup(
      'onboarding',
      new FakeSignatureSubmitter()
        .script(new HttpError(401, 'UNAUTHORIZED', null))
        .holdUntil(gate.promise),
    );
    const pending = vm.confirm();
    vm.dispose();
    gate.resolve();
    await pending;
    expect(toast.messages).toEqual([]);
    expect(navigator.calls).toEqual([]);
    expect(host.onRejected).not.toHaveBeenCalled();
  });

  it('TC-ONB-044 취소(CancelledError)로 끝나면 오류를 보이지 않고 busy만 풀린다', async () => {
    const { vm, toast } = setup(
      'onboarding',
      new FakeSignatureSubmitter().script(new CancelledError('aborted')),
    );
    await vm.confirm();
    expect(vm.getSnapshot()).toMatchObject({ busy: false, error: null });
    expect(toast.messages).toEqual([]);
  });

  it('TC-SIGN-018 "다시 그리기"는 host.onRedraw만 부르고 서버 호출은 없다. 요청 중에는 무시한다', async () => {
    const gate = deferred<void>();
    const { vm, host, submitter } = setup(
      'onboarding',
      new FakeSignatureSubmitter().holdUntil(gate.promise),
    );
    vm.redraw();
    expect(host.onRedraw).toHaveBeenCalledTimes(1);
    expect(submitter.calls).toHaveLength(0);

    const pending = vm.confirm();
    vm.redraw();
    expect(host.onRedraw).toHaveBeenCalledTimes(1);
    gate.resolve();
    await pending;
  });
});
