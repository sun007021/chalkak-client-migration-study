import { json } from '../../core/http/__testing__/FakeTransport';
import { reauth, refreshOk, unauthorized } from '../../core/http/__testing__/createNetHarness';
import { d } from '../../core/time/__testing__/helpers';
import { cal, createRecordHarness, ymds } from './__testing__/createRecordHarness';

describe('RecordViewModel 응답 검증 오류', () => {
  it.each([
    ['month-mismatch', 'TC-REC-012'],
    ['date-out-of-month', 'TC-REC-013'],
    ['duplicate-date', 'TC-REC-013'],
    ['empty-thumbnail', 'TC-REC-013'],
  ])('%s 응답은 처음 불러오기 실패와 같게 오류 + 다시 시도다 (%s)', async (name) => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: `record/posts-calendar__${name}` },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'generic',
      photos: [],
    });
  });

  it('TC-REC-012 계약 위반 응답은 재검증이라면 캐시를 유지하고 토스트만 띄운다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.router.set(cal(2026, 10), 'record/posts-calendar__month-mismatch');
    await h.viewModel.onTabReselected();
    expect(h.viewModel.getSnapshot().status).toBe('content');
    expect(h.viewModel.getSnapshot().photos).toHaveLength(3);
    expect(h.toast.messages).toHaveLength(1);
  });

  it('TC-REC-014 REJECTED·알 수 없는 status의 날짜는 사진 패널이 없는 날로 다루고 앱은 깨지지 않는다 [가정]', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: 'record/posts-calendar__unknown-status' },
    });
    await h.viewModel.onShown();
    const before = h.viewModel.getSnapshot();
    expect(before.status).toBe('content');
    expect(ymds(before.photos)).toEqual(['2026-10-20']);
    h.viewModel.selectDate(d('2026-10-27'));
    h.viewModel.selectDate(d('2026-10-31'));
    expect(h.viewModel.getSnapshot().selectedDate?.toString()).toBe('2026-10-20');
  });
});

describe('RecordViewModel 인증·서버 오류', () => {
  const REFRESH = { 'POST /auth/refresh': () => refreshOk() };

  it('TC-REC-030 REAUTHENTICATION_REQUIRED면 화면은 아무것도 하지 않는다(로그인 이동은 session-expired 이벤트)', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: () => unauthorized(), 'POST /auth/refresh': () => reauth() },
    });
    await h.viewModel.onShown();
    expect(h.authFlow.calls).toEqual([]);
    expect(h.toast.messages).toEqual([]);
    expect(h.viewModel.getSnapshot().error).toBeNull();
  });

  it('TC-REC-030 갱신 뒤에도 401이면 "로그인이 필요해요" 오류이고 "로그인 하기"를 누르면 로그인으로 간다 [가정]', async () => {
    const h = await createRecordHarness({
      routes: { ...REFRESH, [cal(2026, 10)]: () => unauthorized() },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'login-required',
      photos: [],
    });
    expect(h.authFlow.calls).toEqual([]);
    h.viewModel.onLoginPress();
    expect(h.authFlow.calls).toEqual(['login']);
  });

  it('TC-REC-031 400은 문구와 상관없이 "조회할 수 없는 연월" 오류다', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: 'record/posts-calendar__400-invalid-month' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'error', error: 'invalid-month' });
  });

  it('TC-REC-032 500이면 "기록을 불러오지 못했어요" + 다시 시도이고, 다시 시도하면 불러온다', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: 'record/posts-calendar__500-server-error' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'error', error: 'generic' });
    h.router.set(cal(2026, 10), 'record/posts-calendar__2026-10');
    await h.viewModel.retry();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'content', error: null });
  });

  it('TC-REC-032 다시 시도 중에는 로딩이다', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: 'record/posts-calendar__500-server-error' },
    });
    await h.viewModel.onShown();
    h.router.set(cal(2026, 10), async () => {
      await new Promise(() => {});
      return json(200, {});
    });
    void h.viewModel.retry();
    expect(h.viewModel.getSnapshot().status).toBe('loading');
  });
});
