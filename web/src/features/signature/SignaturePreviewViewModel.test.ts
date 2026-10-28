import { t } from '../../copy/ko';
import { ToastController } from '../../core/ui/ToastController';
import { FakeClock } from '../../test/FakeClock';
import { FakeSignatureSubmitter, cancelled, failed, succeeded } from '../../test/FakeSignatureSubmitter';
import { fakePng } from '../../test/FakeSignatureRasterizer';
import { SequentialIdGenerator } from '../../test/sequentialIds';
import { NOW } from '../../test/fixtures';
import type { SignatureMode } from './SignatureMode';
import { SignaturePreviewViewModel } from './SignaturePreviewViewModel';

function setup(mode: SignatureMode = 'onboarding') {
  const clock = new FakeClock(NOW);
  const toast = new ToastController({ clock, ids: new SequentialIdGenerator() });
  const submitter = new FakeSignatureSubmitter();
  const png = fakePng(512);
  const refreshes: number[] = [];
  const vm = new SignaturePreviewViewModel({ mode, png, submitter, toast, refreshSignatureCard: () => (refreshes.push(1), Promise.resolve()) });
  return { vm, submitter, toast, png, refreshes };
}
const message = (toast: ToastController) => toast.state.toast?.message;

describe('SignaturePreviewViewModel 성공', () => {
  it('TC-ONB-024 가입 성공이면 홈으로 가고 사인 카드 재조회는 하지 않는다', async () => {
    const { vm, submitter, png, refreshes, toast } = setup('onboarding');
    expect(await vm.confirm()).toEqual({ kind: 'home' });
    expect(submitter.pngs).toEqual([png]);
    expect(refreshes).toHaveLength(0);
    expect(toast.state.toast).toBeNull();
  });

  it('TC-SIGN-025 TC-SIGN-026 변경 성공이면 토스트 "사인 반영까지 시간이 좀 걸릴 수 있어요!"를 보이고 사인 카드를 다시 불러오며 설정으로 돌아간다', async () => {
    const { vm, toast, refreshes } = setup('change');
    expect(await vm.confirm()).toEqual({ kind: 'settings' });
    expect(message(toast)).toBe(t('sign.change.done'));
    expect(message(toast)).toBe('사인 반영까지 시간이 좀 걸릴 수 있어요!');
    expect(refreshes).toHaveLength(1);
  });

  it('성공 뒤에도 busy를 풀지 않는다(이동 중 연타 방지)', async () => {
    const { vm } = setup('onboarding');
    await vm.confirm();
    expect(vm.state.busy).toBe(true);
    expect(await vm.confirm()).toEqual({ kind: 'stay' });
  });
});

describe('SignaturePreviewViewModel 진행 중', () => {
  it('TC-ONB-043 TC-SIGN-036 확정을 3회 연타해도 submitter는 한 번만 부르고 진행 중에는 busy이다', async () => {
    const { vm, submitter } = setup('onboarding');
    submitter.hold();
    const first = vm.confirm();
    expect(vm.state.busy).toBe(true);
    expect(await vm.confirm()).toEqual({ kind: 'stay' });
    expect(await vm.confirm()).toEqual({ kind: 'stay' });
    submitter.release();
    expect(await first).toEqual({ kind: 'home' });
    expect(submitter.calls).toBe(1);
  });

  it('진행 중에는 다시 그리기가 막힌다(서버 호출 없음, stay)', async () => {
    const { vm, submitter } = setup('onboarding');
    submitter.hold();
    const pending = vm.confirm();
    expect(vm.redraw()).toEqual({ kind: 'stay' });
    submitter.release();
    await pending;
  });

  it('TC-SIGN-018 대기 중 다시 그리기는 서버 호출 없이 그리기로 돌아간다', () => {
    const { vm, submitter, toast } = setup('change');
    expect(vm.redraw()).toEqual({ kind: 'draw' });
    expect(submitter.calls).toBe(0);
    expect(toast.state.toast).toBeNull();
  });

  it('TC-ONB-044 TC-SIGN-037 dispose하면 진행 중 요청을 abort하고 이후 결과·토스트를 내지 않는다', async () => {
    const { vm, submitter, toast } = setup('onboarding');
    submitter.script(failed('generic')).hold();
    const pending = vm.confirm();
    expect(submitter.signals[0]!.aborted).toBe(false);
    vm.dispose();
    expect(submitter.signals[0]!.aborted).toBe(true);
    submitter.release();
    expect(await pending).toEqual({ kind: 'cancelled' });
    expect(toast.state.toast).toBeNull();
  });

  it('TC-SIGN-038 cancelled 결과는 토스트 없이 busy만 풀고 cancelled를 돌려준다(계정 전환 등)', async () => {
    const { vm, submitter, toast, refreshes } = setup('change');
    submitter.script(cancelled);
    expect(await vm.confirm()).toEqual({ kind: 'cancelled' });
    expect(vm.state.busy).toBe(false);
    expect(toast.state.toast).toBeNull();
    expect(refreshes).toHaveLength(0);
  });
});

describe('SignaturePreviewViewModel 가입 실패', () => {
  it.each([
    ['TC-ONB-041 network', failed('network'), '네트워크 연결을 확인해 주세요.'],
    ['TC-ONB-042 generic', failed('generic'), t('onb.signup.error.generic')],
    ['TC-ONB-028 timeout', failed('timeout'), t('onb.signup.error.timeout')],
    ['TC-ONB-036 reupload', failed('reupload'), t('onb.signup.error.reupload')],
  ])('%s: 토스트 문구를 보이고 미리보기에 머문다. busy는 풀리고 같은 PNG로 다시 시도할 수 있다', async (_name, outcome, text) => {
    const { vm, submitter, toast, png } = setup('onboarding');
    submitter.script(outcome, succeeded);
    expect(await vm.confirm()).toEqual({ kind: 'stay' });
    expect(message(toast)).toBe(text);
    expect(vm.state.busy).toBe(false);
    expect(await vm.confirm()).toEqual({ kind: 'home' });
    expect(submitter.pngs).toEqual([png, png]);
  });

  it('TC-ONB-035 invalid면 문구를 보이고 그리기 화면으로 돌아간다', async () => {
    const { vm, submitter, toast } = setup('onboarding');
    submitter.script(failed('invalid'));
    expect(await vm.confirm()).toEqual({ kind: 'draw' });
    expect(message(toast)).toBe('사용할 수 없는 사인이에요. 다시 그려주세요.');
    expect(vm.state.busy).toBe(false);
  });

  it('TC-ONB-030 TC-ONB-033 expired면 "로그인 정보가 만료되었어요. 다시 로그인해 주세요."를 보이고 로그인으로 간다', async () => {
    const { vm, submitter, toast } = setup('onboarding');
    submitter.script(failed('expired'));
    expect(await vm.confirm()).toEqual({ kind: 'login' });
    expect(message(toast)).toBe(t('sign.error.expired'));
  });

  it('TC-ONB-032 TC-ONB-037 가입의 차단(403)은 서버 message를 보이고 로그인으로 간다', async () => {
    const { vm, submitter, toast } = setup('onboarding');
    submitter.script(failed('forbidden', '차단된 소셜 계정입니다.'));
    expect(await vm.confirm()).toEqual({ kind: 'login' });
    expect(message(toast)).toBe('차단된 소셜 계정입니다.');
  });

  it('같은 실패가 연달아 나와도 토스트가 매번 새로 뜬다(고유 id)', async () => {
    const { vm, submitter, toast } = setup('onboarding');
    submitter.script(failed('generic'));
    await vm.confirm();
    const first = toast.state.toast!.id;
    await vm.confirm();
    expect(toast.state.toast!.id).not.toBe(first);
  });
});

describe('SignaturePreviewViewModel 변경 실패', () => {
  it.each([
    ['TC-SIGN-023 generic', failed('generic'), t('sign.change.error.generic'), 'stay'],
    ['TC-SIGN-034 network', failed('network'), t('sign.error.network'), 'stay'],
    ['TC-SIGN-028 reupload', failed('reupload'), t('onb.signup.error.reupload'), 'stay'],
    ['TC-SIGN-032 not_found', failed('not_found'), t('sign.change.error.not-found'), 'stay'],
    ['TC-SIGN-030 TC-SIGN-031 forbidden(D-08)', failed('forbidden', '차단된 회원입니다.'), t('auth.banned.signature'), 'stay'],
    ['TC-SIGN-029 invalid', failed('invalid'), t('sign.error.invalid'), 'draw'],
    ['TC-SIGN-033 expired', failed('expired'), t('sign.error.expired'), 'login'],
  ])('%s: 토스트 문구와 결과 이동이 정해진 대로이고 사인 카드는 다시 불러오지 않는다', async (_name, outcome, text, kind) => {
    const { vm, submitter, toast, refreshes } = setup('change');
    submitter.script(outcome);
    expect(await vm.confirm()).toEqual({ kind });
    expect(message(toast)).toBe(text);
    expect(refreshes).toHaveLength(0);
    expect(vm.state.busy).toBe(false);
  });

  it('TC-SIGN-024 변경이 실패한 뒤 다시 누르면 submitter를 새로 부른다(서비스가 새 uploads부터 시작)', async () => {
    const { vm, submitter } = setup('change');
    submitter.script(failed('generic'), succeeded);
    await vm.confirm();
    expect(await vm.confirm()).toEqual({ kind: 'settings' });
    expect(submitter.calls).toBe(2);
  });
});
