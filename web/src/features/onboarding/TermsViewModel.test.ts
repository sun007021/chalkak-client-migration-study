import { SignupDraft } from '../auth/SignupDraft';
import { FakeExternalLinkOpener } from '../../test/FakeExternalLinkOpener';
import { LegalDocumentLauncher } from './LegalDocument';
import { TermsViewModel } from './TermsViewModel';

function setup() {
  const opener = new FakeExternalLinkOpener();
  const signupDraft = new SignupDraft();
  signupDraft.set({ idToken: 'id-token-1', rawNonce: 'raw-nonce-1' });
  const vm = new TermsViewModel({ launcher: new LegalDocumentLauncher({ opener }), signupDraft });
  return { vm, opener, signupDraft };
}

describe('TermsViewModel', () => {
  it('TC-ONB-002 처음에는 모두 해제이고 다음이 비활성이다', () => {
    const { vm } = setup();
    expect(vm.state).toMatchObject({ serviceAgreed: false, privacyAgreed: false, allAgreed: false, canProceed: false, openFailed: false });
  });

  it('TC-ONB-003 전체 동의를 켜면 두 필수 항목이 모두 선택되고 다음이 활성이다', () => {
    const { vm } = setup();
    vm.toggleAll();
    expect(vm.state).toMatchObject({ serviceAgreed: true, privacyAgreed: true, allAgreed: true, canProceed: true });
  });

  it('TC-ONB-004 전체 동의 상태에서 다시 탭하면 두 항목이 모두 해제된다', () => {
    const { vm } = setup();
    vm.toggleAll();
    vm.toggleAll();
    expect(vm.state).toMatchObject({ serviceAgreed: false, privacyAgreed: false, allAgreed: false, canProceed: false });
  });

  it('TC-ONB-005 필수 항목 하나만 선택하면 전체 동의는 해제 표시이고 다음은 비활성이다', () => {
    const a = setup();
    a.vm.toggleService();
    expect(a.vm.state).toMatchObject({ serviceAgreed: true, privacyAgreed: false, allAgreed: false, canProceed: false });
    const b = setup();
    b.vm.togglePrivacy();
    expect(b.vm.state).toMatchObject({ serviceAgreed: false, privacyAgreed: true, allAgreed: false, canProceed: false });
  });

  it('TC-ONB-006 두 항목을 각각 선택하면 두 번째에서 전체 동의가 자동으로 켜지고 다음이 활성이다', () => {
    const { vm } = setup();
    vm.toggleService();
    expect(vm.state.allAgreed).toBe(false);
    vm.togglePrivacy();
    expect(vm.state).toMatchObject({ allAgreed: true, canProceed: true });
  });

  it('TC-ONB-007 둘 다 선택한 뒤 하나를 해제하면 전체 동의가 해제되고 다음이 비활성이다', () => {
    const { vm } = setup();
    vm.toggleAll();
    vm.toggleService();
    expect(vm.state).toMatchObject({ serviceAgreed: false, privacyAgreed: true, allAgreed: false, canProceed: false });
    vm.toggleService();
    vm.togglePrivacy();
    expect(vm.state).toMatchObject({ serviceAgreed: true, privacyAgreed: false, allAgreed: false, canProceed: false });
  });

  it('TC-ONB-005 한 항목만 켠 상태에서 전체 동의를 누르면 나머지도 켜진다', () => {
    const { vm } = setup();
    vm.toggleService();
    vm.toggleAll();
    expect(vm.state).toMatchObject({ serviceAgreed: true, privacyAgreed: true, allAgreed: true });
  });

  it('TC-ONB-008 TC-ONB-014 문서 보기는 새 탭을 열고 체크 상태를 바꾸지 않는다', () => {
    const { vm, opener } = setup();
    vm.toggleService();
    expect(vm.openDocument('service')).toBe('opened');
    expect(vm.openDocument('privacy')).toBe('opened');
    expect(opener.opened).toHaveLength(2);
    expect(vm.state).toMatchObject({ serviceAgreed: true, privacyAgreed: false, openFailed: false });
  });

  it('TC-ONB-013 열 수 없으면 openFailed가 켜지고 체크는 그대로이며, 다시 열기에 성공하면 꺼진다', () => {
    const { vm, opener } = setup();
    vm.toggleAll();
    opener.result = false;
    expect(vm.openDocument('service')).toBe('failed');
    expect(vm.state).toMatchObject({ openFailed: true, allAgreed: true });
    opener.result = true;
    vm.openDocument('service');
    expect(vm.state.openFailed).toBe(false);
  });

  it('TC-ONB-015 동의가 끝나기 전 다음은 이동하지 않고, 동의하면 사인 그리기로 간다', () => {
    const { vm, signupDraft } = setup();
    expect(vm.next()).toEqual({ kind: 'stay' });
    vm.toggleService();
    expect(vm.next()).toEqual({ kind: 'stay' });
    vm.toggleAll();
    expect(vm.next()).toEqual({ kind: 'signature' });
    expect(signupDraft.get()).toEqual({ idToken: 'id-token-1', rawNonce: 'raw-nonce-1' }); // 사인·가입에서 쓴다
  });

  it('TC-ONB-017 뒤로 가면 로그인으로 돌아가고 보관하던 idToken·rawNonce를 폐기한다', () => {
    const { vm, signupDraft } = setup();
    vm.toggleAll();
    expect(vm.back()).toEqual({ kind: 'login' });
    expect(signupDraft.get()).toBeNull();
  });

  it('TC-ONB-016 화면을 다시 만들면(앱 재시작·재진입) 동의 상태가 초기화된다 — 어디에도 저장하지 않는다', () => {
    const first = setup();
    first.vm.toggleAll();
    const again = new TermsViewModel({ launcher: new LegalDocumentLauncher({ opener: first.opener }), signupDraft: first.signupDraft });
    expect(again.state).toMatchObject({ allAgreed: false, canProceed: false });
  });

  it('상태가 바뀔 때만 구독자에게 알린다', () => {
    const { vm } = setup();
    let calls = 0;
    vm.subscribe(() => (calls += 1));
    vm.toggleService();
    vm.toggleService();
    expect(calls).toBe(2);
  });
});
