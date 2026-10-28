import { TermsViewModel } from './TermsViewModel';

function setup() {
  const host = { openDocument: jest.fn(), onNext: jest.fn(), onBack: jest.fn() };
  return { host, vm: new TermsViewModel(host) };
}

describe('TermsViewModel', () => {
  it('TC-ONB-002 처음에는 모든 체크가 꺼져 있고 "다음"은 비활성이다', () => {
    expect(setup().vm.getSnapshot()).toEqual({
      service: false,
      privacy: false,
      allAgreed: false,
      canProceed: false,
    });
  });

  it('TC-ONB-003 "전체 동의"를 켜면 두 필수 항목이 모두 켜지고 다음이 활성이다', () => {
    const { vm } = setup();
    vm.toggleAll();
    expect(vm.getSnapshot()).toEqual({
      service: true,
      privacy: true,
      allAgreed: true,
      canProceed: true,
    });
  });

  it('TC-ONB-004 전체 동의 상태에서 다시 누르면 모두 꺼진다', () => {
    const { vm } = setup();
    vm.toggleAll();
    vm.toggleAll();
    expect(vm.getSnapshot()).toEqual({
      service: false,
      privacy: false,
      allAgreed: false,
      canProceed: false,
    });
  });

  it('TC-ONB-003 하나만 켜진 상태에서 "전체 동의"를 누르면 모두 켜진다(꺼지지 않는다)', () => {
    const { vm } = setup();
    vm.toggleService();
    vm.toggleAll();
    expect(vm.getSnapshot()).toMatchObject({ service: true, privacy: true, allAgreed: true });
  });

  it('TC-ONB-005 필수 항목 하나만 선택하면 "전체 동의"는 꺼짐이고 다음은 비활성이다', () => {
    const { vm } = setup();
    vm.toggleService();
    expect(vm.getSnapshot()).toEqual({
      service: true,
      privacy: false,
      allAgreed: false,
      canProceed: false,
    });
    vm.toggleService();
    vm.togglePrivacy();
    expect(vm.getSnapshot()).toEqual({
      service: false,
      privacy: true,
      allAgreed: false,
      canProceed: false,
    });
  });

  it('TC-ONB-006 두 항목을 각각 켜면 "전체 동의"가 자동으로 켜지고 다음이 활성이다', () => {
    const { vm } = setup();
    vm.toggleService();
    vm.togglePrivacy();
    expect(vm.getSnapshot()).toEqual({
      service: true,
      privacy: true,
      allAgreed: true,
      canProceed: true,
    });
  });

  it('TC-ONB-007 둘 다 켠 뒤 하나를 끄면 "전체 동의"가 꺼지고 다음이 비활성이다', () => {
    const { vm } = setup();
    vm.toggleAll();
    vm.togglePrivacy();
    expect(vm.getSnapshot()).toEqual({
      service: true,
      privacy: false,
      allAgreed: false,
      canProceed: false,
    });
  });

  it('TC-ONB-008 "보기"는 해당 종류의 문서를 호스트에 요청한다(동의 상태는 바뀌지 않는다)', () => {
    const { vm, host } = setup();
    vm.openDocument('service');
    vm.openDocument('privacy');
    expect(host.openDocument.mock.calls).toEqual([['service'], ['privacy']]);
    expect(vm.getSnapshot().service).toBe(false);
  });

  it('TC-ONB-015 두 항목 동의 후 "다음"은 호스트로 한 번 전달된다', () => {
    const { vm, host } = setup();
    vm.toggleAll();
    vm.next();
    expect(host.onNext).toHaveBeenCalledTimes(1);
  });

  it('TC-ONB-005 두 필수 동의 전에는 "다음"을 호출해도 무시한다', () => {
    const { vm, host } = setup();
    vm.next();
    vm.toggleService();
    vm.next();
    expect(host.onNext).not.toHaveBeenCalled();
  });

  it('TC-ONB-017 back은 호스트로 전달된다', () => {
    const { vm, host } = setup();
    vm.back();
    expect(host.onBack).toHaveBeenCalledTimes(1);
  });

  it('TC-ONB-016 동의는 이 인스턴스의 메모리에만 있다: 새 인스턴스는 항상 처음 상태다', () => {
    const first = setup().vm;
    first.toggleAll();
    expect(setup().vm.getSnapshot().canProceed).toBe(false);
  });
});
