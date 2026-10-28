import { d } from '../../core/time/__testing__/helpers';
import { NetworkError } from '../../core/http/ApiError';
import { json } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import {
  cal,
  createRecordHarness,
  gatedRoute,
  oneMonth,
  MONTHS,
  P_0917,
  P_0930,
  P_1020,
  P_1027,
  P_1031,
  ymds,
  type RecordHarness,
} from './__testing__/createRecordHarness';

/** 10월을 보고 9월까지 불러 둔 뒤 10월로 돌아온 상태. */
async function withNineCached(h: RecordHarness) {
  await h.viewModel.onShown();
  await h.viewModel.goPrevious();
  await h.viewModel.goNext();
}

/** 응답을 미루다가 release 때 body를 내보내는 라우트. */
function gatedBody(h: RecordHarness, key: string, body: () => unknown) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  h.router.set(key, async () => {
    await gate;
    return json(200, body());
  });
  return { release };
}

const nineOnly = () => ({
  year: 2026,
  month: 9,
  posts: [
    {
      topicDate: '2026-09-17',
      postId: P_0917,
      thumbnailImageUrl: 'https://cdn.example.test/new.webp',
      status: 'APPROVED',
    },
  ],
});

describe('RecordViewModel 월별 캐시와 재검증', () => {
  it('TC-REC-020 이전에 본 달로 돌아오면 응답 전에도 캐시를 보여 주고 최신 값으로 교체한다', async () => {
    const h = await createRecordHarness();
    await withNineCached(h);
    const gate = gatedBody(h, cal(2026, 9), nineOnly);
    const pending = h.viewModel.goPrevious();
    const cached = h.viewModel.getSnapshot();
    expect(cached.month.toString()).toBe('2026-09');
    expect(cached.status).toBe('content');
    expect(ymds(cached.photos)).toEqual(['2026-09-17', '2026-09-30']);
    expect(cached.revalidating).toBe(true);
    gate.release();
    await pending;
    const fresh = h.viewModel.getSnapshot();
    expect(ymds(fresh.photos)).toEqual(['2026-09-17']);
    expect(fresh.revalidating).toBe(false);
  });

  it('TC-REC-021 캐시된 달의 재조회가 실패하면 캐시를 유지하고 토스트를 띄운다', async () => {
    const h = await createRecordHarness();
    await withNineCached(h);
    h.router.set(cal(2026, 9), 'record/posts-calendar__500-server-error');
    await h.viewModel.goPrevious();
    const s = h.viewModel.getSnapshot();
    expect(s.status).toBe('content');
    expect(ymds(s.photos)).toEqual(['2026-09-17', '2026-09-30']);
    expect(h.toast.messages).toEqual([t('record.err.other')]);
  });

  it('TC-REC-021 처음 가는 달의 실패는 오류 + 다시 시도이고 이전 달 내용이 남지 않는다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.router.set(cal(2026, 9), 'record/posts-calendar__500-server-error');
    await h.viewModel.goPrevious();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'generic',
      photos: [],
      selectedDate: null,
    });
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-REC-021 현재 달 첫 불러오기 실패도 오류 화면이다', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: 'record/posts-calendar__500-server-error' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'error', photos: [] });
  });

  it('TC-REC-022 탭 재선택은 기존 기록을 유지하다 성공한 최신 값으로 교체한다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    const gate = gatedBody(h, cal(2026, 10), () => ({
      year: 2026,
      month: 10,
      posts: [
        {
          topicDate: '2026-10-20',
          postId: P_1020,
          thumbnailImageUrl: 'https://cdn.example.test/x.webp',
          status: 'APPROVED',
        },
      ],
    }));
    const pending = h.viewModel.onTabReselected();
    expect(h.viewModel.getSnapshot().photos).toHaveLength(3);
    expect(h.viewModel.getSnapshot().revalidating).toBe(true);
    gate.release();
    await pending;
    expect(ymds(h.viewModel.getSnapshot().photos)).toEqual(['2026-10-20']);
  });

  it('TC-REC-022 재검증이 실패하면 기존 기록을 유지한다(복귀 포함)', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.router.set(cal(2026, 10), 'record/posts-calendar__500-server-error');
    await h.viewModel.onTabReselected();
    h.viewModel.onHidden();
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().status).toBe('content');
    expect(h.viewModel.getSnapshot().photos).toHaveLength(3);
    expect(h.toast.messages).toEqual([t('record.err.other'), t('record.err.other')]);
  });

  it('TC-REC-023 캐시를 보여 주다 최신 값으로 교체되거나 재검증돼도 선택 날짜가 유지된다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.viewModel.selectDate(d('2026-10-27'));
    h.router.set(cal(2026, 10), 'record/posts-calendar__2026-10-shuffled');
    await h.viewModel.onTabReselected();
    expect(h.viewModel.getSnapshot().selectedDate?.toString()).toBe('2026-10-27');
    h.viewModel.onHidden();
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().selectedDate?.toString()).toBe('2026-10-27');
  });

  it('TC-REC-015 응답 순서와 무관하게 날짜 오름차순으로 배치된다', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: 'record/posts-calendar__2026-10-shuffled' },
    });
    await h.viewModel.onShown();
    expect(ymds(h.viewModel.getSnapshot().photos)).toEqual([
      '2026-10-20',
      '2026-10-27',
      '2026-10-31',
    ]);
  });
});

describe('RecordViewModel 삭제 반영 (PostChanges)', () => {
  it('TC-REC-024 생성부터 dispose까지 PostChanges를 구독한다(상세가 위에 있어도 반영해야 한다) [가정]', async () => {
    const h = await createRecordHarness();
    expect(h.changes.listenerCount).toBe(1);
    h.viewModel.dispose();
    expect(h.changes.listenerCount).toBe(0);
  });

  it('TC-REC-024 삭제하면 그 칸이 비고, 선택돼 있었다면 같은 달의 가장 최신 사진 날짜로 옮긴다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.changes.publish({ kind: 'deleted', postId: P_1031 });
    const s = h.viewModel.getSnapshot();
    expect(ymds(s.photos)).toEqual(['2026-10-20', '2026-10-27']);
    expect(s.selectedDate?.toString()).toBe('2026-10-27');
    expect(h.callsOf(cal(2026, 10))).toBe(1);
  });

  it('TC-REC-024 삭제 직후 늦은 재검증 응답이 그 postId를 포함해도 다시 보이지 않는다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.changes.publish({ kind: 'deleted', postId: P_1031 });
    await h.viewModel.onTabReselected(); // 서버는 아직 포함해서 응답한다
    expect(ymds(h.viewModel.getSnapshot().photos)).not.toContain('2026-10-31');
  });

  it('TC-REC-024 캐시된 다른 달의 삭제한 게시물도 재방문 때 다시 보이지 않는다', async () => {
    const h = await createRecordHarness();
    await withNineCached(h);
    h.changes.publish({ kind: 'deleted', postId: P_0930 });
    const gate = gatedRoute(h.router, cal(2026, 9), 'record/posts-calendar__2026-09');
    const pending = h.viewModel.goPrevious();
    expect(ymds(h.viewModel.getSnapshot().photos)).toEqual(['2026-09-17']);
    gate.release();
    await pending;
    expect(ymds(h.viewModel.getSnapshot().photos)).toEqual(['2026-09-17']);
  });

  it('TC-REC-024 현재 달의 마지막 게시물을 지워도 현재 달은 선택지에 남고 오류가 아니다', async () => {
    const h = await createRecordHarness({
      routes: {
        [MONTHS]: 'record/posts-calendar-months__without-current',
        [cal(2026, 10)]: oneMonth(2026, 10, '2026-10-27', P_1027),
      },
    });
    await h.viewModel.onShown();
    h.changes.publish({ kind: 'deleted', postId: P_1027 });
    const s = h.viewModel.getSnapshot();
    expect(s).toMatchObject({ status: 'content', error: null, photos: [], selectedDate: null });
    expect(s.availableMonths.map((m) => m.toString())).toContain('2026-10');
  });

  it('TC-REC-024 제목 변경은 기록에 보이는 것이 없어 요청도 상태 변화도 없다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    const before = h.viewModel.getSnapshot();
    h.changes.publish({ kind: 'title-changed', postId: P_1031, title: '새 제목' });
    expect(h.viewModel.getSnapshot()).toBe(before);
    expect(h.callsOf(cal(2026, 10))).toBe(1);
  });

  it('TC-REC-026 홈에서 고른 날짜의 게시물이 삭제됐으면 그 날짜를 선택하지 않고 기본 선택을 따른다', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: 'record/posts-calendar__2026-10-after-delete' },
    });
    await h.viewModel.openDate(d('2026-10-27'));
    await h.viewModel.onShown();
    const s = h.viewModel.getSnapshot();
    expect(s.selectedDate?.toString()).toBe('2026-10-31');
    expect(s.photos.map((p) => p.postId)).not.toContain(P_1027);
  });
});

describe('RecordViewModel 홈에서 날짜를 지정해 열기', () => {
  it('TC-REC-025 이전 달 날짜를 지정하면 그 달과 날짜가 선택되고 최신 사진보다 우선하며 재검증에도 유지된다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.openDate(d('2026-09-17'));
    await h.viewModel.onShown();
    let s = h.viewModel.getSnapshot();
    expect(s.month.toString()).toBe('2026-09');
    expect(s.selectedDate?.toString()).toBe('2026-09-17');
    expect(s.selectedPhoto?.postId).toBe(P_0917);
    await h.viewModel.onTabReselected();
    s = h.viewModel.getSnapshot();
    expect(s.selectedDate?.toString()).toBe('2026-09-17');
  });

  it('TC-REC-025 openDate와 onShown이 겹쳐도 같은 달 요청을 다시 보내지 않는다', async () => {
    const h = await createRecordHarness();
    const gate = gatedRoute(h.router, cal(2026, 9), 'record/posts-calendar__2026-09');
    const first = h.viewModel.openDate(d('2026-09-17'));
    const second = h.viewModel.onShown();
    gate.release();
    await Promise.all([first, second]);
    expect(h.callsOf(cal(2026, 9))).toBe(1);
    expect(h.callsOf(cal(2026, 10))).toBe(0);
    expect(h.viewModel.getSnapshot().selectedDate?.toString()).toBe('2026-09-17');
  });

  it('TC-REC-025 본 적 있는 달이면 응답 전에도 캐시에서 해당 날짜 사진을 보여 준다', async () => {
    const h = await createRecordHarness();
    await withNineCached(h);
    const gate = gatedRoute(h.router, cal(2026, 9), 'record/posts-calendar__2026-09');
    const pending = h.viewModel.openDate(d('2026-09-17'));
    const s = h.viewModel.getSnapshot();
    expect(s.month.toString()).toBe('2026-09');
    expect(s.selectedPhoto?.postId).toBe(P_0917);
    gate.release();
    await pending;
    expect(h.viewModel.getSnapshot().selectedDate?.toString()).toBe('2026-09-17');
  });

  it('TC-REC-026 주간 기록 조회가 실패한 뒤 다시 시도해도 요청한 날짜를 선택한다', async () => {
    const h = await createRecordHarness();
    let failing = true;
    h.router.set(cal(2026, 9), () =>
      fixtureResponse(
        failing ? 'record/posts-calendar__500-server-error' : 'record/posts-calendar__2026-09',
      ),
    );
    await h.viewModel.openDate(d('2026-09-17'));
    expect(h.viewModel.getSnapshot().status).toBe('error');
    failing = false;
    await h.viewModel.retry();
    const s = h.viewModel.getSnapshot();
    expect(s.status).toBe('content');
    expect(s.selectedDate?.toString()).toBe('2026-09-17');
  });
});

describe('RecordViewModel 취소·계정 전환·오프라인', () => {
  it('TC-REC-027 화면을 벗어나 첫 조회가 취소돼도 오류가 아니라 로딩으로 남고 다시 나타나면 불러온다', async () => {
    const h = await createRecordHarness();
    const gate = gatedRoute(h.router, cal(2026, 10), 'record/posts-calendar__2026-10');
    const pending = h.viewModel.onShown();
    h.viewModel.onHidden();
    gate.release();
    await pending;
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'loading', error: null });
    expect(h.toast.messages).toEqual([]);
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().status).toBe('content');
  });

  it('TC-REC-028 계정 전환이면 캐시·선택 날짜가 지워지고 이전 계정 요청의 늦은 응답은 무시된다', async () => {
    const h = await createRecordHarness();
    const gate = gatedRoute(h.router, cal(2026, 10), 'record/posts-calendar__2026-10');
    const pending = h.viewModel.onShown();
    h.viewModel.clearAll();
    gate.release();
    await pending;
    expect(h.viewModel.getSnapshot()).toMatchObject({ photos: [], selectedDate: null });
    expect(h.viewModel.getSnapshot().status).not.toBe('content');
  });

  it('TC-REC-028 로드된 뒤 clearAll하면 선택 날짜가 지워지고 다시 보일 때 처음부터 불러온다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.viewModel.selectDate(d('2026-10-27'));
    h.viewModel.clearAll();
    expect(h.viewModel.getSnapshot()).toMatchObject({ photos: [], selectedDate: null });
    await h.viewModel.onShown();
    expect(h.callsOf(cal(2026, 10))).toBe(2);
    expect(h.viewModel.getSnapshot().selectedDate?.toString()).toBe('2026-10-31');
  });

  it('TC-REC-029 오프라인 첫 진입은 오류이고 온라인 복귀 후 다시 시도하면 성공 로드된다', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: new NetworkError('offline') },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'error', error: 'generic' });
    h.router.set(cal(2026, 10), 'record/posts-calendar__2026-10');
    await h.viewModel.retry();
    expect(h.viewModel.getSnapshot().status).toBe('content');
    expect(h.viewModel.getSnapshot().photos).toHaveLength(3);
  });

  it('TC-REC-029 캐시가 있을 때 오프라인이면 캐시를 유지하고 네트워크 토스트를 띄운다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.router.set(cal(2026, 10), new NetworkError('offline'));
    await h.viewModel.onTabReselected();
    expect(h.viewModel.getSnapshot().photos).toHaveLength(3);
    expect(h.toast.messages).toEqual([t('common.error.network')]);
  });
});
