import { deferred } from '../../core/http/__testing__/FakeTransport';
import { UpdateDialogViewModel } from './UpdateDialogViewModel';
import { FakeStoreOpener } from './__testing__/fakes';

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

describe('UpdateDialogViewModel', () => {
  it('TC-BOOT-029 "업데이트"를 연타해도 스토어 열기는 정확히 1회 호출된다', async () => {
    const opener = new FakeStoreOpener();
    const gate = deferred<void>();
    opener.gate = gate.promise;
    const vm = new UpdateDialogViewModel(opener);

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

  it('TC-BOOT-031 업데이트 흐름이 실패하거나 취소돼도 예외 없이 끝나고 다시 누를 수 있다(다이얼로그 유지)', async () => {
    const opener = new FakeStoreOpener();
    opener.failWith = new Error('user cancelled update');
    const vm = new UpdateDialogViewModel(opener);

    await expect(vm.onUpdatePress()).resolves.toBeUndefined();
    expect(vm.getSnapshot().opening).toBe(false);

    opener.failWith = null;
    await vm.onUpdatePress();
    expect(opener.calls).toBe(2);
  });
});
