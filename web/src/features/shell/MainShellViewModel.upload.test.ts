import { AnalyticsReporter } from '../../core/analytics/AnalyticsReporter';
import { ToastController } from '../../core/ui/ToastController';
import { FakeAnalyticsTracker } from '../../test/FakeAnalyticsTracker';
import { FakeClock } from '../../test/FakeClock';
import { FakeUploadEntry } from '../../test/FakeUploadEntry';
import { SequentialIdGenerator } from '../../test/sequentialIds';
import { GuestGate } from './GuestGate';
import { MainShellViewModel } from './MainShellViewModel';

function setup(mode: 'member' | 'guest') {
  const toast = new ToastController({ clock: new FakeClock(), ids: new SequentialIdGenerator() });
  const upload = new FakeUploadEntry();
  const vm = new MainShellViewModel({ mode, guestGate: new GuestGate({ toast }), analytics: new AnalyticsReporter({ tracker: new FakeAnalyticsTracker() }), uploadEntry: upload });
  return { vm, upload };
}

describe('MainShellViewModel 업로드 진입 정리 (REQ-UPL-011, TC-UPL-010)', () => {
  it('TC-UPL-010 셸이 사라지면(dispose) 확인 중이던 업로드 진입을 취소한다', () => {
    const { vm, upload } = setup('member');
    vm.pressUpload();
    expect(upload.cancels).toBe(0);
    vm.dispose();
    expect(upload.cancels).toBe(1);
  });

  it('TC-UPL-010 게스트 셸도 dispose에서 cancel을 부른다(진입 구현이 확인 중이 아니면 아무 일도 없다)', () => {
    const { vm, upload } = setup('guest');
    vm.dispose();
    expect(upload.cancels).toBe(1);
    expect(upload.starts).toBe(0);
  });
});
