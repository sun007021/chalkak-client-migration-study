import { deferred } from '../../core/http/__testing__/FakeTransport';
import { UpdateDialogViewModel } from './UpdateDialogViewModel';
import { FakeAppExiter, FakeStoreOpener } from './__testing__/fakes';

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

function setup(platform: 'ios' | 'android') {
  const opener = new FakeStoreOpener();
  const exiter = new FakeAppExiter();
  const vm = new UpdateDialogViewModel(opener, platform, exiter);
  return { opener, exiter, vm };
}

describe('UpdateDialogViewModel', () => {
  it('TC-BOOT-029 "업데이트"를 연타해도 스토어 열기는 정확히 1회 호출된다', async () => {
    const { opener, vm } = setup('ios');
    const gate = deferred<void>();
    opener.gate = gate.promise;

    const first = vm.onUpdatePress();
    void vm.onUpdatePress();
    void vm.onUpdatePress();
    await flush();
    expect(vm.getSnapshot().opening).toBe(true);
    gate.resolve();
    await first;
    await flush();

    expect(opener.calls).toBe(1);
    expect(vm.getSnapshot().opening).toBe(false);
  });

  it('TC-BOOT-031 REQ-BOOT-009 iOS는 스토어 열기에 실패해도 앱을 종료하지 않고 다이얼로그가 남아 다시 누를 수 있다', async () => {
    const { opener, exiter, vm } = setup('ios');
    opener.failWith = new Error('open failed');

    await expect(vm.onUpdatePress()).resolves.toBeUndefined();
    expect(vm.getSnapshot().opening).toBe(false);
    expect(exiter.exits).toBe(0);

    opener.failWith = null;
    await vm.onUpdatePress();
    expect(opener.calls).toBe(2);
    expect(exiter.exits).toBe(0);
  });

  it('TC-BOOT-031 REQ-BOOT-009 iOS에는 취소 버튼이 없다', () => {
    expect(setup('ios').vm.canCancel).toBe(false);
  });

  it('TC-BOOT-031 REQ-BOOT-009 Android에는 취소 버튼이 있고 누르면 앱을 종료한다', () => {
    const { vm, exiter } = setup('android');
    expect(vm.canCancel).toBe(true);
    vm.onCancelPress();
    expect(exiter.exits).toBe(1);
  });

  it('TC-BOOT-031 REQ-BOOT-009 iOS에서 취소 호출은 무시한다', () => {
    const { vm, exiter } = setup('ios');
    vm.onCancelPress();
    expect(exiter.exits).toBe(0);
  });

  it('TC-BOOT-031 REQ-BOOT-009 Android는 스토어 열기에 실패하면 앱을 종료한다', async () => {
    const { opener, exiter, vm } = setup('android');
    opener.failWith = new Error('open failed');
    await expect(vm.onUpdatePress()).resolves.toBeUndefined();
    expect(exiter.exits).toBe(1);
  });

  it('TC-BOOT-031 REQ-BOOT-009 Android에서 스토어 열기에 성공하면 앱을 종료하지 않고 다이얼로그가 남는다', async () => {
    const { opener, exiter, vm } = setup('android');
    await vm.onUpdatePress();
    expect(opener.calls).toBe(1);
    expect(exiter.exits).toBe(0);
    expect(vm.getSnapshot().opening).toBe(false);
  });
});
