import { t } from '../../copy/ko';
import { finish, settle } from '../../test/homeHarness';
import { bytesOf } from '../../test/webpBytes';
import { pngOf } from '../../test/pngBytes';
import { createRecordHarness } from '../../test/recordHarness';
import { NOV, OCT_20, OCT_27, OCT_31, SEP } from '../../test/recordRoutes';
import type { RecordHarness } from '../../test/recordHarness';
import { SaveDeniedError } from './FileDownloader';
import { readPngSize } from './calendarImage';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

async function open(h: RecordHarness) {
  await finish(h, h.viewModel.onShown());
  return h.viewModel;
}

describe('RecordViewModel 이미지로 저장 (REQ-REC-037, 039)', () => {
  it('TC-REC-038 현재 달 달력을 PNG로 렌더해 chalkak-calendar-2026-10.png로 저장하고 성공 토스트가 한 번 뜬다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    await finish(h, vm.saveImage());
    expect(h.exporter.models).toHaveLength(1);
    expect(h.downloader.files).toHaveLength(1);
    const [file] = h.downloader.files;
    expect(file!.name).toBe('chalkak-calendar-2026-10.png');
    expect(file!.blob.type).toBe('image/png');
    expect([...(await bytesOf(file!.blob)).slice(0, 4)]).toEqual(PNG_SIGNATURE);
    const size = await readPngSize(file!.blob);
    expect(size!.width).toBeGreaterThan(0);
    expect(size!.height).toBeGreaterThan(0);
    expect(h.toasts.messages).toEqual([t('record.save.ok')]);
    expect(vm.state.saving).toBe(false);
  });

  it('TC-REC-038 이미지에 담기는 내용: 연월 제목, 요일 머리글, 날짜 칸, 사진이 있는 날의 썸네일', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    await finish(h, vm.saveImage());
    const model = h.exporter.models[0]!;
    expect(model).toMatchObject({ year: 2026, month: 10, title: '2026년 10월', weekdays: ['일', '월', '화', '수', '목', '금', '토'] });
    expect(model.cells).toHaveLength(35);
    expect(model.cells.slice(0, 4).every((c) => c === null)).toBe(true); // 10/1은 목요일
    const byDate = Object.fromEntries(model.cells.flatMap((c) => (c ? [[c.date, c]] : [])));
    expect(Object.keys(byDate)).toHaveLength(31);
    expect(byDate['2026-10-20']).toMatchObject({ day: 20, pending: false, thumbnailUrl: `https://cdn.example.test/posts/${OCT_20}/thumbnail.webp` });
    expect(byDate['2026-10-27']).toMatchObject({ day: 27, pending: true, thumbnailUrl: `https://cdn.example.test/posts/${OCT_27}/thumbnail.webp` });
    expect(byDate['2026-10-31']).toMatchObject({ day: 31, pending: false, thumbnailUrl: `https://cdn.example.test/posts/${OCT_31}/thumbnail.webp` });
    expect(byDate['2026-10-21']).toMatchObject({ day: 21, thumbnailUrl: null, pending: false });
  });

  it('TC-REC-038 보고 있는 달의 이름으로 저장한다(9월이면 chalkak-calendar-2026-09.png)', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    await finish(h, vm.selectPreviousMonth());
    await finish(h, vm.saveImage());
    expect(h.downloader.files.map((f) => f.name)).toEqual(['chalkak-calendar-2026-09.png']);
    expect(h.exporter.models[0]).toMatchObject({ year: 2026, month: 9, title: '2026년 9월' });
  });

  it('TC-REC-038 사진이 없는 달도 저장한다(임시: 문서에 허용 여부가 없다)', async () => {
    const h = createRecordHarness({ now: '2026-11-03T03:00:00Z', routes: { [NOV]: 'record/posts-calendar__2026-11-empty' } });
    const vm = await open(h);
    await finish(h, vm.saveImage());
    expect(h.downloader.files.map((f) => f.name)).toEqual(['chalkak-calendar-2026-11.png']);
    expect(h.toasts.messages).toEqual([t('record.save.ok')]);
  });

  it('TC-REC-038 내용이 아직 없는 상태(로딩·오류)에서는 저장을 시작하지 않는다(임시)', async () => {
    const h = createRecordHarness({ routes: { [SEP]: 'record/posts-calendar__500-server-error' } });
    const vm = await open(h);
    await finish(h, vm.selectPreviousMonth());
    expect(vm.state.body.status).toBe('error');
    await finish(h, vm.saveImage());
    expect(h.exporter.models).toHaveLength(0);
    expect(h.downloader.files).toHaveLength(0);
    expect(h.toasts.messages).toEqual([]);
  });

  it.each([
    ['PNG가 아닌 형식(image/jpeg)', () => pngOf(10, 10, 'image/jpeg')],
    ['시그니처가 PNG가 아닌 바이트', () => new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25])], { type: 'image/png' })],
    ['가로세로가 0인 PNG', () => pngOf(0, 0)],
    ['빈 Blob', () => new Blob([], { type: 'image/png' })],
  ])('TC-REC-039 렌더 결과가 %s이면 저장하지 않고 "이미지 저장에 실패했어요"를 보인다', async (_name, make) => {
    const h = createRecordHarness();
    const vm = await open(h);
    h.exporter.result = make;
    await finish(h, vm.saveImage());
    expect(h.downloader.files).toHaveLength(0);
    expect(h.toasts.messages).toEqual([t('record.save.fail')]);
    expect(vm.state.saving).toBe(false);
  });

  it('TC-REC-039 쓰기가 거절되면(SaveDeniedError) "이미지 저장 권한이 필요해요"이고 앱은 멈추지 않는다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    h.downloader.fail = new SaveDeniedError('denied');
    await finish(h, vm.saveImage());
    expect(h.toasts.messages).toEqual([t('record.save.denied')]);
    expect(vm.state.saving).toBe(false);
    h.downloader.fail = null;
    await finish(h, vm.saveImage()); // 이후 다시 저장할 수 있다
    expect(h.toasts.messages).toEqual([t('record.save.denied'), t('record.save.ok')]);
  });

  it.each([
    ['다운로드 쓰기 실패', (h: RecordHarness) => (h.downloader.fail = new Error('disk full'))],
    ['렌더 실패', (h: RecordHarness) => (h.exporter.fail = new Error('canvas tainted'))],
  ])('TC-REC-039 %s이면 "이미지 저장에 실패했어요"를 보이고 달력 화면은 그대로다', async (_name, breakIt) => {
    const h = createRecordHarness();
    const vm = await open(h);
    breakIt(h);
    await finish(h, vm.saveImage());
    expect(h.toasts.messages).toEqual([t('record.save.fail')]);
    expect(h.downloader.files).toHaveLength(0);
    expect(vm.state.body.status).toBe('ready');
    expect(vm.state.saving).toBe(false);
  });
});

describe('RecordViewModel 저장 연타 (TC-REC-040)', () => {
  it('TC-REC-040 저장이 진행 중일 때 저장 버튼 연타는 무시되고 저장은 1회만 실행된다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    h.exporter.hold();
    const first = vm.saveImage();
    await settle();
    expect(vm.state.saving).toBe(true);
    const second = vm.saveImage();
    const third = vm.saveImage();
    await settle();
    h.exporter.release();
    await finish(h, Promise.all([first, second, third]));
    expect(h.exporter.models).toHaveLength(1);
    expect(h.downloader.files).toHaveLength(1);
    expect(h.toasts.messages).toEqual([t('record.save.ok')]);
    expect(vm.state.saving).toBe(false);
  });

  it('TC-REC-040 다운로드 단계에서 붙잡혀 있어도 연타는 무시되고, 끝난 뒤의 다음 탭은 다시 저장한다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    h.downloader.hold();
    const first = vm.saveImage();
    await settle();
    await vm.saveImage();
    h.downloader.release();
    await finish(h, first);
    expect(h.downloader.files).toHaveLength(1);
    await finish(h, vm.saveImage());
    expect(h.downloader.files).toHaveLength(2);
    expect(h.toasts.messages).toEqual([t('record.save.ok'), t('record.save.ok')]);
  });

  it('TC-REC-040 실패한 저장 뒤에도 saving이 풀려 다시 저장할 수 있다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    h.exporter.fail = new Error('x');
    await finish(h, vm.saveImage());
    h.exporter.fail = null;
    await finish(h, vm.saveImage());
    expect(h.downloader.files).toHaveLength(1);
  });
});
