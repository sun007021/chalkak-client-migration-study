import { deferred } from '../../test/deferred';
import type { WithdrawOutcome } from '../auth/AccountService';
import type { SessionMode } from '../boot/authGate';
import type { LegalDocumentKind, LegalOpenResult } from '../onboarding/LegalDocument';
import { SettingsViewModel } from './SettingsViewModel';

function setup(mode: SessionMode = 'member', appVersion = '1.2.3') {
  const log: string[] = [];
  const opened: LegalDocumentKind[] = [];
  const control = {
    refresh: () => Promise.resolve(),
    load: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    withdraw: (): Promise<WithdrawOutcome> => Promise.resolve({ kind: 'done' }),
    open: (): LegalOpenResult => 'opened',
    clear: () => Promise.resolve(),
  };
  const vm = new SettingsViewModel({
    mode,
    signatureCard: { refresh: () => (log.push('signature.refresh'), control.refresh()) },
    notifications: { load: () => (log.push('push.load'), control.load()), cancelPending: () => void log.push('push.cancelPending') },
    account: { logout: () => (log.push('logout'), control.logout()), withdraw: () => (log.push('withdraw'), control.withdraw()) },
    launcher: { open: (kind) => (opened.push(kind), control.open()) },
    session: { clear: () => (log.push('session.clear'), control.clear()) },
    appVersion,
  });
  return { vm, log, opened, control };
}

describe('SettingsViewModel 초기 상태', () => {
  it('REQ-SET-005 모드와 앱 버전 문자열을 그대로 상태로 갖고 대화상자는 닫혀 있다', () => {
    const { vm } = setup('member', '1.2.3');
    expect(vm.state).toEqual({ mode: 'member', appVersion: '1.2.3', dialog: null, busy: null, documentOpenFailed: false });
  });
});

describe('SettingsViewModel.onShown / onHidden', () => {
  it('TC-SET-002 회원이 보면 사인 조회와 푸시 설정 조회를 둘 다 시작한다', () => {
    const { vm, log } = setup();
    vm.onShown();
    expect(log.sort()).toEqual(['push.load', 'signature.refresh']);
  });

  it('REQ-SET-004 REQ-SET-010 설정 탭이 보일 때마다 다시 조회한다', () => {
    const { vm, log } = setup();
    vm.onShown();
    vm.onShown();
    expect(log.filter((e) => e === 'signature.refresh')).toHaveLength(2);
    expect(log.filter((e) => e === 'push.load')).toHaveLength(2);
  });

  it('TC-SET-002 사인 조회가 실패해도 푸시 설정 조회는 시작되고 그 반대도 같다(미처리 거부 없음)', async () => {
    const a = setup();
    a.control.refresh = () => Promise.reject(new Error('signature down'));
    a.vm.onShown();
    expect(a.log).toContain('push.load');
    const b = setup();
    b.control.load = () => Promise.reject(new Error('push down'));
    b.vm.onShown();
    expect(b.log).toContain('signature.refresh');
    await Promise.resolve();
  });

  it('TC-SET-002 한쪽이 동기적으로 던져도 다른 쪽은 시작된다', () => {
    const { vm, log, control } = setup();
    control.refresh = () => {
      throw new Error('sync failure');
    };
    expect(() => vm.onShown()).not.toThrow();
    expect(log).toContain('push.load');
  });

  it('TC-SET-008 REQ-SET-002 게스트가 봐도 사인·푸시 설정 API를 부르지 않는다', () => {
    const { vm, log } = setup('guest');
    vm.onShown();
    vm.onHidden();
    expect(log).toEqual([]);
  });

  it('TC-SET-030 화면에서 사라지면 진행 중인 푸시 저장을 취소한다', () => {
    const { vm, log } = setup();
    vm.onHidden();
    expect(log).toEqual(['push.cancelPending']);
  });
});

describe('SettingsViewModel 확인 대화상자', () => {
  it('TC-SET-041 REQ-AUTH-032 로그아웃 행은 로그아웃 대화상자를 연다(API 호출 없음)', () => {
    const { vm, log } = setup();
    vm.requestLogout();
    expect(vm.state.dialog).toBe('logout');
    expect(log).toEqual([]);
  });

  it('TC-SET-044 REQ-AUTH-037 회원탈퇴 행은 탈퇴 대화상자를 연다(API 호출 없음)', () => {
    const { vm, log } = setup();
    vm.requestWithdraw();
    expect(vm.state.dialog).toBe('withdraw');
    expect(log).toEqual([]);
  });

  it('REQ-SET-002 게스트는 대화상자를 열 수 없다', () => {
    const { vm } = setup('guest');
    vm.requestLogout();
    vm.requestWithdraw();
    expect(vm.state.dialog).toBeNull();
  });

  it('TC-SET-042 로그아웃 대화상자에서 취소하면 닫히고 API 호출이 0건이다', () => {
    const { vm, log } = setup();
    vm.requestLogout();
    vm.cancelDialog();
    expect(vm.state.dialog).toBeNull();
    expect(log).toEqual([]);
  });

  it('TC-SET-045 탈퇴 대화상자에서 취소하면 DELETE(withdraw) 호출이 0건이다', () => {
    const { vm, log } = setup();
    vm.requestWithdraw();
    vm.cancelDialog();
    expect(vm.state.dialog).toBeNull();
    expect(log).not.toContain('withdraw');
  });
});

describe('SettingsViewModel.confirmLogout', () => {
  it('TC-SET-043 REQ-AUTH-033 확인하면 로그아웃을 한 번 요청하고 대화상자를 닫는다', async () => {
    const { vm, log } = setup();
    vm.requestLogout();
    await vm.confirmLogout();
    expect(log).toEqual(['logout']);
    expect(vm.state).toMatchObject({ dialog: null, busy: null });
  });

  it('REQ-AUTH-040 처리 중에는 busy이고 확인을 다시 눌러도 요청은 한 번이다', async () => {
    const { vm, log, control } = setup();
    const gate = deferred<void>();
    control.logout = () => gate.promise;
    vm.requestLogout();
    const first = vm.confirmLogout();
    const second = vm.confirmLogout();
    expect(vm.state.busy).toBe('logout');
    gate.resolve();
    await Promise.all([first, second]);
    expect(log.filter((e) => e === 'logout')).toHaveLength(1);
    expect(vm.state.busy).toBeNull();
  });

  it('대화상자를 열지 않고는(회원이 아니거나 열린 적 없이) 확인해도 아무것도 하지 않는다', async () => {
    const { vm, log } = setup();
    await vm.confirmLogout();
    expect(log).toEqual([]);
  });
});

describe('SettingsViewModel.confirmWithdraw', () => {
  it('TC-SET-046 REQ-AUTH-038 성공하면 탈퇴를 한 번 요청하고 대화상자를 닫는다(로그인 이동은 세션 이벤트가 맡는다)', async () => {
    const { vm, log } = setup();
    vm.requestWithdraw();
    await vm.confirmWithdraw();
    expect(log).toEqual(['withdraw']);
    expect(vm.state).toMatchObject({ dialog: null, busy: null });
  });

  it('TC-SET-046 REQ-AUTH-039 실패하면 대화상자를 닫고 설정에 머무른다(토스트는 AccountService가 보인다)', async () => {
    const { vm, control } = setup();
    control.withdraw = () => Promise.resolve({ kind: 'failed' });
    vm.requestWithdraw();
    await vm.confirmWithdraw();
    expect(vm.state).toMatchObject({ mode: 'member', dialog: null, busy: null });
  });

  it('취소(cancelled) 결과도 대화상자를 닫는다', async () => {
    const { vm, control } = setup();
    control.withdraw = () => Promise.resolve({ kind: 'cancelled' });
    vm.requestWithdraw();
    await vm.confirmWithdraw();
    expect(vm.state.dialog).toBeNull();
  });

  it('REQ-AUTH-040 처리 중에는 busy이고, 취소(cancelDialog)와 중복 확인은 무시된다', async () => {
    const { vm, log, control } = setup();
    const gate = deferred<WithdrawOutcome>();
    control.withdraw = () => gate.promise;
    vm.requestWithdraw();
    const first = vm.confirmWithdraw();
    const second = vm.confirmWithdraw();
    expect(vm.state.busy).toBe('withdraw');
    vm.cancelDialog();
    expect(vm.state.dialog).toBe('withdraw');
    gate.resolve({ kind: 'done' });
    await Promise.all([first, second]);
    expect(log.filter((e) => e === 'withdraw')).toHaveLength(1);
    expect(vm.state).toMatchObject({ dialog: null, busy: null });
  });

  it('탈퇴가 실패한 뒤에는 다시 대화상자를 열어 재시도할 수 있다', async () => {
    const { vm, log, control } = setup();
    control.withdraw = () => Promise.resolve({ kind: 'failed' });
    vm.requestWithdraw();
    await vm.confirmWithdraw();
    vm.requestWithdraw();
    await vm.confirmWithdraw();
    expect(log.filter((e) => e === 'withdraw')).toHaveLength(2);
  });
});

describe('SettingsViewModel.openDocument', () => {
  it('TC-SET-047 REQ-SET-006 이용약관과 개인정보처리방침은 각각 service, privacy 문서를 연다', () => {
    const { vm, opened } = setup();
    expect(vm.openDocument('service')).toBe('opened');
    expect(vm.openDocument('privacy')).toBe('opened');
    expect(opened).toEqual(['service', 'privacy']);
    expect(vm.state.documentOpenFailed).toBe(false);
  });

  it.each<LegalOpenResult>(['blocked', 'failed'])('TC-SET-048 REQ-ONB-009 열지 못하면(%s) documentOpenFailed이고, 다시 열기에 성공하면 지운다', (result) => {
    const { vm, control } = setup();
    control.open = () => result;
    expect(vm.openDocument('service')).toBe(result);
    expect(vm.state.documentOpenFailed).toBe(true);
    control.open = () => 'opened';
    vm.openDocument('service');
    expect(vm.state.documentOpenFailed).toBe(false);
  });
});

describe('SettingsViewModel.pressLogin (게스트)', () => {
  it('REQ-NAV-020 게스트 플래그(세션)를 지우고 로그인으로 보낸다', async () => {
    const { vm, log } = setup('guest');
    expect(await vm.pressLogin()).toEqual({ kind: 'login' });
    expect(log).toEqual(['session.clear']);
  });
});
