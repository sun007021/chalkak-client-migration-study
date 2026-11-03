import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { finish, settle } from '../../test/homeHarness';
import { createRecordHarness, datesOf, postNumbers, readyBody } from '../../test/recordHarness';
import { MONTHS_KEY, OCT, OCT_20, OCT_27, OCT_31, SEP, SEP_17, SEP_30, monthResponse, monthsBody, recPostId } from '../../test/recordRoutes';

const ym = (year: number, month: number) => ({ year, month });
const offline = () => Promise.reject(new TypeError('Failed to fetch'));
const octAfterDelete = 'record/posts-calendar__2026-10-after-delete';
/** 5xx 한 번의 재검증 실패 = 최초 호출 + 자동 재시도 2회(D-21). */
const failing500 = Array.from({ length: 3 }, () => 'record/posts-calendar__500-server-error');

describe('RecordViewModel 캐시와 재검증 (REQ-REC-021~023, TC-REC-019~023)', () => {
  it('TC-REC-020 이전에 본 달로 돌아오면 응답 전에도 캐시를 보여 주고 최신 값으로 교체한다', async () => {
    const gate = deferred<void>();
    const fresh = [
      ['2026-09-17', SEP_17, 'APPROVED'],
      ['2026-09-29', recPostId(295), 'PENDING'],
    ] as const;
    const h = createRecordHarness({ routes: { [SEP]: ['record/posts-calendar__2026-09', async () => (await gate.promise, json(200, { year: 2026, month: 9, posts: fresh.map(([topicDate, postId, status]) => ({ topicDate, postId, thumbnailImageUrl: `https://cdn.example.test/${postId}.webp`, status })) }))] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    await finish(h, vm.selectPreviousMonth()); // 9월 첫 방문
    await finish(h, vm.selectNextMonth());
    const back = vm.selectPreviousMonth(); // 9월 재방문
    await settle();
    expect(vm.state.month).toEqual(ym(2026, 9));
    expect(vm.state.body).toMatchObject({ status: 'ready', revalidating: true });
    expect(datesOf(vm)).toEqual(['2026-09-17', '2026-09-30']); // 캐시
    gate.resolve();
    await finish(h, back);
    expect(vm.state.body).toMatchObject({ status: 'ready', revalidating: false });
    expect(datesOf(vm)).toEqual(['2026-09-17', '2026-09-29']); // 새 응답
    expect(h.router.calls(SEP)).toHaveLength(2);
  });

  it('TC-REC-020 REQ-REC-021 캐시는 달 단위다: 본 적 없는 달은 캐시 없이 로딩이다', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [SEP]: gated(gate, 'record/posts-calendar__2026-09') } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    const moving = vm.selectPreviousMonth();
    await settle();
    expect(vm.state.body).toEqual({ status: 'loading' });
    gate.resolve();
    await finish(h, moving);
  });

  it('TC-REC-019 월 이동 버튼 연타: 마지막 선택 달만 표시되고 늦게 도착한 다른 달 응답이 화면을 덮지 않는다', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [SEP]: gated(gate, 'record/posts-calendar__2026-09') } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    const toSep = vm.selectPreviousMonth(); // 응답이 늦는 9월
    await settle();
    const toOct = vm.selectNextMonth(); // 곧바로 10월로
    await finish(h, toOct);
    expect(vm.state.month).toEqual(ym(2026, 10));
    gate.resolve();
    await finish(h, toSep);
    expect(vm.state.month).toEqual(ym(2026, 10));
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
    expect(vm.state.selectedDate).toBe('2026-10-31');
    // 늦은 9월 응답은 그 달 캐시에는 남아 다시 가면 바로 보인다.
    const again = vm.selectPreviousMonth();
    await settle();
    expect(vm.state.body).toMatchObject({ status: 'ready' });
    expect(datesOf(vm)).toEqual(['2026-09-17', '2026-09-30']);
    await finish(h, again);
  });

  it('TC-REC-022 기록 탭 재선택·복귀 재검증: 기존 기록을 유지하다 성공한 최신 값으로 교체한다', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [OCT]: ['record/posts-calendar__2026-10', gated(gate, octAfterDelete)] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    const again = vm.onTabReselect();
    await settle();
    expect(vm.state.body).toMatchObject({ status: 'ready', revalidating: true });
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
    gate.resolve();
    await finish(h, again);
    expect(vm.state.body).toMatchObject({ status: 'ready', revalidating: false });
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-31']);
  });

  it('TC-REC-022 화면이 숨겨졌다 다시 보일 때(onShown)도 같은 방식으로 월 목록과 보이는 달을 재검증한다', async () => {
    const gate = deferred<void>(); // 테스트 수정: 응답을 붙잡아 두어야 재검증 중 상태를 볼 수 있다(응답 없이 settle만으로는 이미 끝난다)
    const h = createRecordHarness({ routes: { [OCT]: ['record/posts-calendar__2026-10', gated(gate, 'record/posts-calendar__2026-10')] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    vm.onHidden();
    const before = h.ff.calls.length;
    const shown = vm.onShown();
    await settle();
    expect(vm.state.body).toMatchObject({ status: 'ready', revalidating: true }); // 첫 진입과 달리 캐시를 바로 보여 준다
    gate.resolve();
    await finish(h, shown);
    expect(recordRequestsSince(h, before).sort()).toEqual(['GET /posts/calendar', 'GET /posts/calendar/months']);
  });

  it('TC-REC-022 TC-REC-021 재검증이 실패하면 기존 기록을 유지하고 토스트 "기록을 불러오지 못했어요"만 한 번 보인다', async () => {
    const h = createRecordHarness({ routes: { [OCT]: ['record/posts-calendar__2026-10', 'record/posts-calendar__500-server-error'] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    await finish(h, vm.onTabReselect());
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
    expect(vm.state.body).toMatchObject({ status: 'ready', revalidating: false });
    expect(h.toasts.messages).toEqual([t('record.err.other')]);
  });

  it('TC-REC-021 캐시된 달로 돌아와 재조회가 계약 위반 응답이어도 캐시를 유지하고 토스트다', async () => {
    const h = createRecordHarness({ routes: { [SEP]: ['record/posts-calendar__2026-09', monthResponse(2026, 10)] } }); // 테스트 수정: month-mismatch fixture는 year 2026 month 9라 9월 요청에는 불일치가 아니다. 9월 요청에 10월 응답을 준다
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    await finish(h, vm.selectPreviousMonth());
    await finish(h, vm.selectNextMonth());
    await finish(h, vm.selectPreviousMonth());
    expect(datesOf(vm)).toEqual(['2026-09-17', '2026-09-30']);
    expect(h.toasts.messages).toEqual([t('record.err.other')]);
  });

  it('TC-REC-029 캐시가 있을 때 오프라인이면 내용을 유지하고 토스트 "네트워크 연결을 확인해 주세요."를 한 번 보인다', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    h.router.set(OCT, offline);
    await finish(h, vm.onTabReselect());
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
    expect(h.toasts.messages).toEqual([t('common.error.network')]);
  });

  it('TC-REC-022 재검증 실패 뒤 다음 재검증이 성공하면 새 값으로 교체된다', async () => {
    const h = createRecordHarness({ routes: { [OCT]: ['record/posts-calendar__2026-10', ...failing500, octAfterDelete] } }); // 테스트 수정: 읽기 GET의 자동 재시도(3회 호출)가 모두 실패해야 한 번의 재검증 실패다
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    await finish(h, vm.onTabReselect());
    await finish(h, vm.onTabReselect());
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-31']);
    expect(h.toasts.messages).toHaveLength(1);
  });

  it('TC-REC-023 REQ-REC-023 사용자가 고른 날짜는 최신 값으로 교체되거나 재검증돼도 날짜가 아직 있으면 유지된다', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    vm.selectDate('2026-10-20');
    await finish(h, vm.onTabReselect());
    expect(vm.state.selectedDate).toBe('2026-10-20');
    vm.onHidden();
    await finish(h, vm.onShown());
    expect(vm.state.selectedDate).toBe('2026-10-20');
    // 다른 달을 보고 돌아와도 그 달에서 고른 날짜가 유지된다.
    await finish(h, vm.selectPreviousMonth());
    vm.selectDate('2026-09-17');
    await finish(h, vm.selectNextMonth());
    await finish(h, vm.selectPreviousMonth());
    expect(vm.state.selectedDate).toBe('2026-09-17');
  });

  it('TC-REC-023 재검증 응답에서 선택한 날짜의 사진이 사라졌으면 기본 선택(가장 늦은 날짜)으로 옮긴다(임시)', async () => {
    const h = createRecordHarness({ routes: { [OCT]: ['record/posts-calendar__2026-10', octAfterDelete] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    vm.selectDate('2026-10-27');
    await finish(h, vm.onTabReselect());
    expect(vm.state.selectedDate).toBe('2026-10-31');
    expect(vm.state.selectedPost?.postId).toBe(OCT_31);
  });

  it('TC-REC-023 재검증 응답으로 상태(PENDING → APPROVED)가 바뀌면 선택한 날짜의 사진이 새 값으로 교체된다', async () => {
    const h = createRecordHarness({
      routes: {
        [OCT]: [
          'record/posts-calendar__2026-10',
          monthResponse(2026, 10, [
            ['2026-10-20', OCT_20, 'APPROVED'],
            ['2026-10-27', OCT_27, 'APPROVED'],
            ['2026-10-31', OCT_31, 'APPROVED'],
          ]),
        ],
      },
    });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    vm.selectDate('2026-10-27');
    expect(vm.state.selectedPost?.status).toBe('PENDING');
    await finish(h, vm.onTabReselect());
    expect(vm.state.selectedDate).toBe('2026-10-27');
    expect(vm.state.selectedPost?.status).toBe('APPROVED');
  });
});

const recordRequestsSince = (h: { ff: { calls: readonly { method: string; path: string }[] } }, from: number): string[] =>
  h.ff.calls.slice(from).map((c) => `${c.method} ${c.path}`);

describe('RecordViewModel 삭제한 게시물 기억 (REQ-REC-027~029, TC-REC-024, TC-FEED-044)', () => {
  it('TC-REC-024 REQ-REC-028 상세에서 삭제를 마치면(removed 이벤트) 즉시 그 날짜 칸이 비고 선택 날짜는 같은 달의 가장 늦은 사진으로 옮긴다', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    vm.selectDate('2026-10-27');
    h.changes.publish({ type: 'removed', postId: OCT_27 });
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-31']);
    expect(vm.state.selectedDate).toBe('2026-10-31');
    expect(vm.state.selectedPost?.postId).toBe(OCT_31);
  });

  it('TC-REC-024 REQ-REC-028 선택하지 않은 날짜의 삭제는 선택을 건드리지 않는다', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    vm.selectDate('2026-10-20');
    h.changes.publish({ type: 'removed', postId: OCT_27 });
    expect(vm.state.selectedDate).toBe('2026-10-20');
  });

  it('TC-REC-024 REQ-REC-028 달의 마지막 사진을 지우면 선택 없음이고 현재 달은 선택지에 남는다', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    for (const id of [OCT_20, OCT_27, OCT_31]) h.changes.publish({ type: 'removed', postId: id });
    expect(vm.state).toMatchObject({ selectedDate: null, selectedPost: null });
    expect(vm.state.body).toEqual({ status: 'ready', posts: [], revalidating: false });
    expect(vm.state.availableMonths).toContainEqual(ym(2026, 10));
  });

  it('TC-REC-024 REQ-REC-027 삭제 뒤 캐시한 달을 다시 방문하거나 재검증 응답이 그 postId를 아직 포함해도 다시 나타나지 않는다', async () => {
    const h = createRecordHarness(); // 서버 응답은 계속 삭제한 사진을 포함한다
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    await finish(h, vm.selectPreviousMonth());
    await finish(h, vm.selectNextMonth());
    h.changes.publish({ type: 'removed', postId: OCT_27 });
    await finish(h, vm.onTabReselect());
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-31']);
    await finish(h, vm.selectPreviousMonth());
    await finish(h, vm.selectNextMonth());
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-31']);
  });

  it('TC-FEED-044 삭제 직후 시작해 있던 늦은 재검증 응답이 해당 게시물을 다시 포함해도 되살리지 않는다', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [OCT]: ['record/posts-calendar__2026-10', gated(gate, 'record/posts-calendar__2026-10')] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    const late = vm.onTabReselect();
    await settle();
    h.changes.publish({ type: 'removed', postId: OCT_27 });
    gate.resolve();
    await finish(h, late);
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-31']);
  });

  it('TC-REC-024 다른 달(캐시)의 게시물 삭제도 그 달을 다시 방문했을 때 반영된다(서버 응답이 아직 포함해도)', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [SEP]: ['record/posts-calendar__2026-09', gated(gate, 'record/posts-calendar__2026-09')] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    await finish(h, vm.selectPreviousMonth());
    await finish(h, vm.selectNextMonth());
    h.changes.publish({ type: 'removed', postId: SEP_30 });
    const back = vm.selectPreviousMonth();
    await settle();
    expect(datesOf(vm)).toEqual(['2026-09-17']);
    expect(vm.state.selectedDate).toBe('2026-09-17');
    gate.resolve();
    await finish(h, back);
    expect(datesOf(vm)).toEqual(['2026-09-17']);
  });

  it('REQ-REC-029 삭제로 사진이 없어진 달도 클라이언트가 임의로 선택지에서 지우지 않고 다음 월 목록 재조회 때 서버 기준으로 갱신한다', async () => {
    const h = createRecordHarness({ routes: { [MONTHS_KEY]: ['record/posts-calendar-months__recent-first', () => json(200, monthsBody([2026, 10]))] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    await finish(h, vm.selectPreviousMonth());
    for (const id of [SEP_17, SEP_30]) h.changes.publish({ type: 'removed', postId: id });
    expect(vm.state.availableMonths).toEqual([ym(2026, 10), ym(2026, 9)]);
    expect(vm.state.body).toEqual({ status: 'ready', posts: [], revalidating: false });
    vm.onHidden();
    await finish(h, vm.onShown());
    expect(vm.state.availableMonths).toEqual([ym(2026, 10)]);
  });

  it('TC-FEED-044 like·title 이벤트는 기록 달력에 영향이 없고 요청도 보내지 않는다', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    const before = h.ff.calls.length;
    const state = vm.state;
    h.changes.publish({ type: 'like', postId: OCT_20, isLiked: true, likeCount: 3 });
    h.changes.publish({ type: 'title', postId: OCT_20, title: '새 제목' });
    await settle();
    expect(h.ff.calls.length).toBe(before);
    expect(vm.state).toBe(state);
  });
});

describe('RecordViewModel 업로드 반영 (PostChange created, TC-REC-043)', () => {
  const created = (topicDate: string, postId = OCT_27, moderationStatus: 'VALIDATING' | 'PENDING' | 'APPROVED' = 'PENDING') => ({ type: 'created', postId, topicDate, moderationStatus }) as const;
  const octWithout27 = monthResponse(2026, 10, [['2026-10-20', OCT_20, 'APPROVED']]);

  it('TC-REC-043 보이는 달의 업로드 성공(created)이면 조용히 다시 불러와 새 사진이 나타난다(그 사이 목록은 로딩으로 비지 않는다)', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [OCT]: [octWithout27, gated(gate, 'record/posts-calendar__2026-10')] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    expect(datesOf(vm)).toEqual(['2026-10-20']);
    h.changes.publish(created('2026-10-27'));
    await settle();
    expect(vm.state.body.status).toBe('ready');
    expect(datesOf(vm)).toEqual(['2026-10-20']);
    gate.resolve();
    await finish(h, Promise.resolve());
    await settle();
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
    expect(h.router.calls(OCT)).toHaveLength(2);
  });

  it('TC-REC-043 화면이 숨겨진 동안의 업로드는 그 달 캐시를 버리고, 다시 보일 때 한 번 불러온다', async () => {
    const h = createRecordHarness({ routes: { [OCT]: [octWithout27, 'record/posts-calendar__2026-10'] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    vm.onHidden();
    h.changes.publish(created('2026-10-27'));
    await settle();
    expect(h.router.calls(OCT)).toHaveLength(1); // 숨겨진 동안은 요청하지 않는다
    await finish(h, vm.onShown());
    expect(h.router.calls(OCT)).toHaveLength(2);
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
  });

  it('TC-REC-043 다른 달의 업로드는 지금 요청하지 않고 그 달 캐시만 버린다', async () => {
    const gate = deferred<void>(); // 테스트 수정: 두 번째 9월 응답을 붙잡아 두어야 로딩 상태를 볼 수 있다
    const sepAfterUpload = monthResponse(2026, 9, [['2026-09-17', SEP_17, 'APPROVED']]);
    const h = createRecordHarness({ routes: { [SEP]: ['record/posts-calendar__2026-09', async () => (await gate.promise, sepAfterUpload())] } });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    await finish(h, vm.selectPreviousMonth());
    await finish(h, vm.selectNextMonth());
    const before = h.ff.calls.length;
    h.changes.publish(created('2026-09-30', SEP_30));
    await settle();
    expect(h.ff.calls.length).toBe(before);
    const moving = vm.selectPreviousMonth();
    await settle();
    expect(vm.state.body).toEqual({ status: 'loading' }); // 버려진 캐시: 낡은 9월을 보여 주지 않는다
    gate.resolve();
    await finish(h, moving);
    expect(datesOf(vm)).toEqual(['2026-09-17']);
  });

  it('TC-REC-043 VALIDATING 상태의 created도 그 달 캐시를 버리지만 달력에는 서버가 주는 PENDING·APPROVED만 나온다', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    h.changes.publish(created('2026-10-27', OCT_27, 'VALIDATING'));
    await settle();
    await finish(h, Promise.resolve());
    expect(readyBody(vm).posts.every((p) => p.status === 'PENDING' || p.status === 'APPROVED')).toBe(true);
    expect(postNumbers(vm)).toEqual(['290', '201', '291']);
  });
});

describe('RecordViewModel 계정 전환 (TC-REC-028, D-17)', () => {
  it('TC-REC-028 계정 전환 시 월별 캐시·선택 날짜·월 선택지가 지워지고 다음에 보일 때 새로 불러온다', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    await finish(h, vm.selectPreviousMonth());
    vm.selectDate('2026-09-17');
    vm.onHidden();
    vm.resetForAccountChange();
    h.changes.reset();
    expect(vm.state).toMatchObject({ selectedDate: null, selectedPost: null, availableMonths: [], body: { status: 'loading' }, saving: false, pendingHintOpen: false });
    const before = h.ff.calls.length;
    const gate = deferred<void>();
    h.router.set(OCT, gated(gate, 'record/posts-calendar__2026-10'));
    const shown = vm.onShown();
    await settle();
    expect(vm.state.body).toEqual({ status: 'loading' }); // 이전 계정의 캐시를 보여 주지 않는다
    expect(vm.state.month).toEqual(ym(2026, 10));
    gate.resolve();
    await finish(h, shown);
    expect(h.ff.calls.length - before).toBeGreaterThanOrEqual(2); // 월 목록과 달력을 다시 읽었다
    expect(vm.state.selectedDate).toBe('2026-10-31');
  });

  it('TC-REC-028 삭제 기억도 지워진다(PostChanges.reset)', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    h.changes.publish({ type: 'removed', postId: OCT_27 });
    expect(h.changes.wasRemoved(OCT_27)).toBe(true);
    vm.onHidden();
    vm.resetForAccountChange();
    h.changes.reset();
    expect(h.changes.wasRemoved(OCT_27)).toBe(false);
    await finish(h, vm.onShown());
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']); // 새 계정에서는 같은 postId가 다시 보인다
  });

  it('TC-REC-028 보이는 중에 전환되면 곧바로 새 계정으로 다시 불러오고, A 요청의 늦은 응답은 무시된다', async () => {
    const gateA = deferred<void>();
    const h = createRecordHarness({ routes: { [OCT]: [gated(gateA, 'record/posts-calendar__2026-10'), octAfterDelete] } });
    const vm = h.viewModel;
    const a = vm.onShown();
    await settle();
    vm.resetForAccountChange();
    h.changes.reset();
    await finish(h, Promise.resolve());
    await settle();
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-31']); // B의 응답
    gateA.resolve();
    await finish(h, a);
    await settle();
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-31']);
    expect(h.toasts.messages).toEqual([]);
    // A의 응답은 캐시에도 남지 않는다: 달을 갔다 와도 B의 값이다.
    await finish(h, vm.selectPreviousMonth());
    await finish(h, vm.selectNextMonth());
    expect(datesOf(vm).includes('2026-10-27')).toBe(false);
  });

  it('TC-REC-028 A 요청의 늦은 실패는 B 화면에 토스트나 오류를 만들지 않는다', async () => {
    const gateA = deferred<void>();
    const h = createRecordHarness({
      routes: {
        [OCT]: [
          async () => {
            await gateA.promise;
            return json(500, { errorCode: 'INTERNAL_ERROR', message: 'x' });
          },
          'record/posts-calendar__2026-10',
        ],
      },
    });
    const vm = h.viewModel;
    const a = vm.onShown();
    await settle();
    vm.resetForAccountChange();
    h.changes.reset();
    await settle();
    gateA.resolve();
    await finish(h, a);
    await settle();
    expect(vm.state.body.status).toBe('ready');
    expect(h.toasts.messages).toEqual([]);
  });
});
