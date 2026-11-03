import { deferred } from '../../test/deferred';
import { finish, settle } from '../../test/homeHarness';
import { pngOf } from '../../test/pngBytes';
import { createRecordHarness } from '../../test/recordHarness';
import type { CalendarImageModel } from './calendarImage';
import type { CalendarImageExporter } from './CalendarImageExporter';

/** signal을 기록하고 gate가 열릴 때까지 붙잡는다. respectAbort가 true면 취소 때 AbortError로 거절한다. */
class HeldExporter implements CalendarImageExporter {
  readonly signals: (AbortSignal | undefined)[] = [];
  readonly gate = deferred<void>();
  constructor(private readonly respectAbort: boolean) {}
  async render(_model: CalendarImageModel, signal?: AbortSignal): Promise<Blob> {
    this.signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      if (this.respectAbort) signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      void this.gate.promise.then(resolve);
    });
    return pngOf();
  }
}

async function openWith(exporter: CalendarImageExporter) {
  const h = createRecordHarness();
  const vm = h.another({ exporter });
  await finish(h, vm.onShown());
  return { h, vm };
}

describe('RecordViewModel 저장 취소 (REQ-REC-039)', () => {
  it('exporter에 취소 신호를 넘기고, 화면 이탈(onHidden)이 저장을 취소하면 토스트도 다운로드도 없고 saving이 풀린다', async () => {
    const exporter = new HeldExporter(true);
    const { h, vm } = await openWith(exporter);
    const saving = vm.saveImage();
    await settle();
    expect(vm.state.saving).toBe(true);
    expect(exporter.signals[0]?.aborted).toBe(false);
    vm.onHidden();
    expect(exporter.signals[0]?.aborted).toBe(true);
    await finish(h, saving);
    expect(h.toasts.messages).toEqual([]);
    expect(h.downloader.files).toHaveLength(0);
    expect(vm.state.saving).toBe(false);
  });

  it('계정 전환은 저장을 취소하고, 렌더가 취소를 무시하고 끝나도 다운로드와 토스트를 건너뛴다', async () => {
    const exporter = new HeldExporter(false);
    const { h, vm } = await openWith(exporter);
    const saving = vm.saveImage();
    await settle();
    vm.onHidden();
    vm.resetForAccountChange();
    expect(exporter.signals[0]?.aborted).toBe(true);
    exporter.gate.resolve();
    await finish(h, saving);
    expect(h.downloader.files).toHaveLength(0);
    expect(h.toasts.messages).toEqual([]);
    expect(vm.state.saving).toBe(false);
  });

  it('렌더 뒤 다운로드 전에 계정이 바뀌면 다운로드를 하지 않는다', async () => {
    const exporter = new HeldExporter(false);
    const { h, vm } = await openWith(exporter);
    const saving = vm.saveImage();
    await settle();
    vm.onHidden();
    vm.resetForAccountChange();
    exporter.gate.resolve();
    await finish(h, saving);
    expect(h.downloader.files).toHaveLength(0);
  });

  it('dispose도 진행 중인 저장을 취소한다', async () => {
    const exporter = new HeldExporter(true);
    const { h, vm } = await openWith(exporter);
    const saving = vm.saveImage();
    await settle();
    vm.dispose();
    expect(exporter.signals[0]?.aborted).toBe(true);
    await finish(h, saving);
    expect(h.toasts.messages).toEqual([]);
  });

  it('취소 뒤에는 다시 저장할 수 있다', async () => {
    const exporter = new HeldExporter(true);
    const { h, vm } = await openWith(exporter);
    const first = vm.saveImage();
    await settle();
    vm.onHidden();
    await finish(h, first);
    await finish(h, vm.onShown());
    exporter.gate.resolve();
    await finish(h, vm.saveImage());
    expect(h.downloader.files).toHaveLength(1);
  });
});
