import { createBootHarness } from '../boot/__testing__/createBootHarness';
import {
  PENDING,
  createSignUpHarness,
  type SignUpHarness,
} from './__testing__/createSignUpHarness';
import { SignUpFlowOwner } from './SignUpFlowOwner';

function setup() {
  const boot = createBootHarness();
  const created: { pending: typeof PENDING; harness: SignUpHarness }[] = [];
  const owner = new SignUpFlowOwner(boot.viewModel, (pending) => {
    const harness = createSignUpHarness({ pending });
    created.push({ pending, harness });
    return harness.flow;
  });
  return { boot, owner, created };
}

describe('SignUpFlowOwner', () => {
  it('phase가 sign-up이 아니면 흐름이 없다', async () => {
    const { boot, owner } = setup();
    expect(owner.getSnapshot().flow).toBeNull();
    await boot.viewModel.start();
    boot.viewModel.toLogin();
    expect(owner.getSnapshot().flow).toBeNull();
  });

  it('TC-ONB-018 toSignUp(pending)이면 그 pending으로 흐름을 만들고 screen_view terms를 정확히 1번 보낸다', () => {
    const { boot, owner, created } = setup();
    boot.viewModel.toSignUp(PENDING);
    expect(created).toHaveLength(1);
    expect(created[0].pending).toBe(PENDING);
    expect(owner.getSnapshot().flow).toBe(created[0].harness.flow);
    expect(created[0].harness.analytics.screenNames).toEqual(['terms']);

    owner.getSnapshot(); // 조회·리렌더는 새 흐름도 새 screen_view도 만들지 않는다
    boot.viewModel.toSignUp(PENDING);
    expect(created).toHaveLength(1);
  });

  it('TC-ONB-017 로그인으로 돌아가면 흐름을 dispose하고 비운다(idToken·rawNonce·약관 선택 폐기)', () => {
    const { boot, owner, created } = setup();
    boot.viewModel.toSignUp(PENDING);
    const flow = created[0].harness.flow;
    flow.terms.toggleAll();
    boot.viewModel.toLogin();
    expect(owner.getSnapshot().flow).toBeNull();
    // dispose된 흐름은 더 이상 구독을 받지 않는다.
    const listener = jest.fn();
    flow.subscribe(listener)();
    expect(listener).not.toHaveBeenCalled();
  });

  it('TC-ONB-046 새 로그인 시도가 새 쌍으로 가입을 시작하면 흐름을 새 pending으로 교체한다', () => {
    const { boot, owner, created } = setup();
    boot.viewModel.toSignUp({ idToken: 'tok-1', rawNonce: 'n-1' });
    boot.viewModel.toLogin();
    boot.viewModel.toSignUp({ idToken: 'tok-2', rawNonce: 'n-2' });
    expect(created.map((c) => c.pending.idToken)).toEqual(['tok-1', 'tok-2']);
    expect(owner.getSnapshot().flow).toBe(created[1].harness.flow);
    // 새 흐름은 약관 선택이 초기화된 상태다.
    expect(created[1].harness.flow.terms.getSnapshot().canProceed).toBe(false);
  });

  it('TC-ONB-024 가입이 끝나 메인으로 가면 가입 화면(약관·사인·미리보기)이 사라진다', () => {
    const { boot, owner } = setup();
    boot.viewModel.toSignUp(PENDING);
    boot.viewModel.toMain('member');
    expect(owner.getSnapshot().flow).toBeNull();
    expect(boot.viewModel.getSnapshot()).toMatchObject({
      phase: 'main',
      mode: 'member',
      pendingSignUp: null,
    });
  });

  it('TC-ONB-045 세션 만료 이벤트로 로그인에 가면 가입 흐름도 정리된다', async () => {
    const { boot, owner } = setup();
    await boot.viewModel.start();
    boot.viewModel.toSignUp(PENDING);
    boot.viewModel.toLogin();
    expect(owner.getSnapshot().flow).toBeNull();
  });

  it('owner.dispose는 구독을 끊고 살아 있는 흐름도 dispose한다', () => {
    const { boot, owner, created } = setup();
    boot.viewModel.toSignUp(PENDING);
    owner.dispose();
    boot.viewModel.toLogin();
    boot.viewModel.toSignUp(PENDING);
    expect(created).toHaveLength(1);
  });
});
