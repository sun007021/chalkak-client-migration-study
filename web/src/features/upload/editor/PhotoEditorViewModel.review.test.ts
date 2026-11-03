import { IDENTITY_EDIT, NO_AUTO_VALUES } from '../editModel';
import { FakeRenderScheduler } from '../../../test/FakeRenderScheduler';
import { editorFakes, settle } from '../../../test/editorHarness';
import { imageFile } from '../../../test/FakeImageDecoder';
import { FILTER_THUMBNAIL_LONG_EDGE, PhotoEditorViewModel } from './PhotoEditorViewModel';

function setup(options: { lazyThumbnails?: boolean } = {}) {
  const fakes = editorFakes();
  const scheduler = new FakeRenderScheduler();
  const confirmed: unknown[] = [];
  const vm = new PhotoEditorViewModel({
    source: imageFile(),
    initialEdit: IDENTITY_EDIT,
    decoder: fakes.decoder,
    preview: fakes.preview,
    analyzer: fakes.analyzer,
    scheduler,
    lazyThumbnails: options.lazyThumbnails,
    onConfirm: (edit) => confirmed.push(edit),
    onCancel: () => undefined,
  });
  return { vm, fakes, scheduler, confirmed };
}
const previews = (fakes: ReturnType<typeof editorFakes>) => fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE);
const thumbs = (fakes: ReturnType<typeof editorFakes>) => fakes.preview.calls.filter((c) => c.maxLongEdge <= FILTER_THUMBNAIL_LONG_EDGE);

describe('코드 리뷰 2: 렌더 요청 합치기와 썸네일 지연', () => {
  it('한 프레임 안의 여러 변경은 마지막 값으로 한 번만 미리보기를 요청한다', async () => {
    const { vm, fakes, scheduler } = setup();
    vm.start();
    await settle();
    scheduler.flush();
    await settle();
    const before = previews(fakes).length;
    vm.selectFilter('warm');
    vm.setAdjustValue('exposure', 0.1);
    vm.setAdjustValue('exposure', 0.2);
    vm.setAdjustValue('exposure', 0.3);
    expect(previews(fakes)).toHaveLength(before); // 프레임 전에는 요청하지 않는다
    expect(vm.state.adjustValues.exposure).toBeCloseTo(0.3, 12); // 화면 값은 바로 따라간다
    scheduler.flush();
    await settle();
    expect(previews(fakes)).toHaveLength(before + 1);
    const last = previews(fakes).at(-1)!;
    expect(last.edit.filter).toBe('warm');
    expect(last.edit.adjustmentLayers.manual.exposure).toBeCloseTo(0.3, 12);
  });

  it('썸네일은 필터 탭이 열려 있을 때만 그린다(조정 슬라이더를 움직이는 동안은 그리지 않는다)', async () => {
    const { vm, fakes, scheduler } = setup({ lazyThumbnails: true });
    vm.start();
    await settle();
    scheduler.flush();
    await settle();
    vm.selectTool('adjust');
    vm.setAdjustValue('exposure', 0.4);
    scheduler.flush();
    await settle();
    expect(thumbs(fakes)).toHaveLength(0);
    vm.selectTool('filter');
    scheduler.flush();
    await settle();
    expect(thumbs(fakes)).toHaveLength(6);
    for (const call of thumbs(fakes)) expect(call.edit.adjustmentLayers.manual.exposure).toBeCloseTo(0.4, 12);
  });

  it('완료는 아직 예약만 된 마지막 변경을 먼저 렌더 요청에 반영한다', async () => {
    const { vm, fakes, scheduler, confirmed } = setup();
    vm.start();
    await settle();
    scheduler.flush();
    await settle();
    vm.selectFilter('cool');
    await vm.confirm();
    expect(confirmed).toHaveLength(1);
    expect(previews(fakes).at(-1)!.edit.filter).toBe('cool');
  });
});

describe('코드 리뷰 7: 분석 실패 뒤 다시 시도할 수 있다', () => {
  it('분석이 실패하면 같은 영역이어도 다음 도구 이동에서 다시 분석한다', async () => {
    const fakes = editorFakes();
    let fail = true;
    fakes.analyzer.result = () => {
      if (fail) throw new Error('boom');
      return { ...NO_AUTO_VALUES, exposure: 0.3 };
    };
    const vm = new PhotoEditorViewModel({ source: imageFile(), initialEdit: IDENTITY_EDIT, decoder: fakes.decoder, preview: fakes.preview, analyzer: fakes.analyzer, onConfirm: () => undefined, onCancel: () => undefined });
    vm.start();
    await settle();
    expect(fakes.analyzer.calls).toHaveLength(1);
    fail = false;
    vm.selectTool('adjust');
    await settle();
    expect(fakes.analyzer.calls).toHaveLength(2);
    expect(vm.state.adjustmentLayers.autoValues.exposure).toBeCloseTo(0.3, 12);
  });
});
