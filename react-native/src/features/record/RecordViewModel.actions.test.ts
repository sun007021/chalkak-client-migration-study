import { d } from '../../core/time/__testing__/helpers';
import { pathOf } from '../../data/__testing__/requestAsserts';
import { t } from '../../shared/copy';
import { ImagePermissionDeniedError } from './CalendarImage';
import { fakePng } from './__testing__/FakeCalendarImage';
import { createRecordHarness, P_1027, P_1031 } from './__testing__/createRecordHarness';

describe('RecordViewModel 사진 패널 동작', () => {
  it('TC-REC-034 APPROVED 사진은 "피드에서 보기"로 내 게시물 상세를 썸네일과 함께 연다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.viewModel.onViewFeed();
    expect(h.navigator.details).toEqual([
      { postId: P_1031, thumbnailUrl: expect.stringContaining(`${P_1031}/thumbnail.webp`) },
    ]);
  });

  it('TC-REC-034 "전시 보러가기"는 해당 주제 날짜의 전시를 연다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.viewModel.onViewDisplay();
    expect(h.navigator.displays).toEqual(['2026-10-31']);
  });

  it('TC-REC-035 PENDING 날짜는 두 동작이 모두 무시되고 상세 API도 부르지 않는다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.viewModel.selectDate(d('2026-10-27'));
    expect(h.viewModel.getSnapshot().selectedPhoto).toMatchObject({
      postId: P_1027,
      status: 'PENDING',
    });
    h.viewModel.onViewFeed();
    h.viewModel.onViewDisplay();
    expect(h.navigator.details).toEqual([]);
    expect(h.navigator.displays).toEqual([]);
    expect(
      h.transport.requests.map((r) => pathOf(r)).filter((p) => /^\/posts\/[0-9a-f-]{36}/.test(p)),
    ).toEqual([]);
  });

  it('TC-REC-034 선택한 사진이 없으면 두 동작 모두 아무 일도 없다', async () => {
    const h = await createRecordHarness({ now: '2026-08-15T03:00:00Z' });
    await h.viewModel.onShown();
    h.viewModel.onViewFeed();
    h.viewModel.onViewDisplay();
    expect(h.navigator.details).toEqual([]);
    expect(h.navigator.displays).toEqual([]);
  });
});

describe('RecordViewModel 달력 이미지 저장', () => {
  it('TC-REC-038 현재 달 달력을 PNG로 렌더해 chalkak-calendar-2026-10.png로 저장하고 성공 토스트가 한 번 뜬다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    await h.viewModel.saveImage();
    expect(h.imageRenderer.inputs).toHaveLength(1);
    expect(h.imageRenderer.inputs[0].month.toString()).toBe('2026-10');
    expect(h.imageRenderer.inputs[0].photos).toHaveLength(3);
    expect(h.imageSaver.saved).toHaveLength(1);
    const saved = h.imageSaver.saved[0];
    expect(saved.fileName).toBe('chalkak-calendar-2026-10.png');
    expect([...saved.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(h.toast.messages).toEqual([t('record.save.ok')]);
    expect(h.viewModel.getSnapshot().saving).toBe(false);
  });

  it('TC-REC-038 보는 달이 바뀌면 그 달 이름으로 저장한다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    await h.viewModel.goPrevious();
    await h.viewModel.saveImage();
    expect(h.imageSaver.saved[0].fileName).toBe('chalkak-calendar-2026-09.png');
  });

  it('TC-REC-039 저장 권한이 거부되면 권한 토스트를 띄우고 멈추지 않는다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.imageSaver.behavior = () => Promise.reject(new ImagePermissionDeniedError('denied'));
    await h.viewModel.saveImage();
    expect(h.toast.messages).toEqual([t('record.save.denied')]);
    expect(h.viewModel.getSnapshot().saving).toBe(false);
  });

  it('TC-REC-039 쓰기 실패나 렌더 실패(PNG가 아니거나 크기 0)는 실패 토스트이고 다시 저장할 수 있다 [가정]', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.imageSaver.behavior = () => Promise.reject(new Error('disk'));
    await h.viewModel.saveImage();
    h.imageSaver.behavior = () => Promise.resolve();
    h.imageRenderer.result = () =>
      Promise.resolve({ bytes: new Uint8Array([1, 2, 3, 4]), width: 10, height: 10 });
    await h.viewModel.saveImage();
    h.imageRenderer.result = () => Promise.resolve({ ...fakePng(), width: 0 });
    await h.viewModel.saveImage();
    h.imageRenderer.result = () => Promise.reject(new Error('render'));
    await h.viewModel.saveImage();
    expect(h.toast.messages).toEqual(Array(4).fill(t('record.save.fail')));
    h.imageRenderer.result = () => Promise.resolve(fakePng());
    await h.viewModel.saveImage();
    expect(h.toast.messages.at(-1)).toBe(t('record.save.ok'));
  });

  it('TC-REC-040 저장 중 버튼을 연타해도 저장은 1회만 실행된다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    let release!: () => void;
    h.imageSaver.behavior = () => new Promise<void>((resolve) => (release = resolve));
    const first = h.viewModel.saveImage();
    expect(h.viewModel.getSnapshot().saving).toBe(true);
    const second = h.viewModel.saveImage();
    const third = h.viewModel.saveImage();
    await Promise.resolve();
    release();
    await Promise.all([first, second, third]);
    expect(h.imageRenderer.inputs).toHaveLength(1);
    expect(h.imageSaver.saved).toHaveLength(1);
    expect(h.toast.messages).toEqual([t('record.save.ok')]);
  });
});
