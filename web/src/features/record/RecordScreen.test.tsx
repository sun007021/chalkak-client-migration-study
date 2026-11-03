import { vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { refreshSuccessBody } from '../../test/fixtures';
import { NOV, OCT, OCT_20, OCT_31, SEP, MONTHS_KEY, monthResponse, monthsBody, recPostId, thumbOf } from '../../test/recordRoutes';
import { advanceApp, openRecordApp, recordLoaded } from '../../test/recordScreens';
import { toastText } from '../../test/postScreens';
import { TOAST_DURATION_MS } from '../../constants';

vi.setConfig({ testTimeout: 15_000 }); // 구현 전에는 findBy가 5초 뒤 단언 오류로 끝나게 한다(테스트 시간 초과로 가려지지 않게)

const tid = (id: string) => screen.getByTestId(id);
const maybe = (id: string) => screen.queryByTestId(id);
const click = (id: string) => fireEvent.click(tid(id));
const dayIds = () => Array.from(tid('record.calendar-grid').querySelectorAll('[data-testid^="record.day-20"]')).map((el) => el.getAttribute('data-testid')!);
const dayPhotoIds = () => Array.from(tid('record.calendar-grid').querySelectorAll('[data-testid^="record.day-photo-"]')).map((el) => el.getAttribute('data-testid')!.slice('record.day-photo-'.length));
const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

describe('기록 화면 구성 (TC-REC-009, 011, 042)', () => {
  it('TC-REC-042 기록 식별자(이전·다음 달, 월 선택, 날짜 칸, 사진 패널, 이미지로 저장)가 존재한다', async () => {
    await openRecordApp();
    await recordLoaded();
    for (const id of ['record.root', 'record.month-label', 'record.prev-month-button', 'record.next-month-button', 'record.month-picker-button', 'record.weekday-header', 'record.calendar-grid', 'record.day-2026-10-20', 'record.selected-photo', 'record.save-image-button']) {
      expect(screen.getByTestId(id), id).toBeInTheDocument();
    }
    expect(maybe('record.loading')).not.toBeInTheDocument();
    expect(maybe('record.error-state')).not.toBeInTheDocument();
  });

  it('TC-REC-001 TC-REC-042 응답 전에는 로딩 표시(record.loading)가 보이고 응답 뒤 사라진다', async () => {
    const gate = deferred<void>();
    await openRecordApp({ routes: { [OCT]: gated(gate, 'record/posts-calendar__2026-10') } });
    expect(await screen.findByTestId('record.loading')).toBeInTheDocument();
    await act(async () => gate.resolve());
    await recordLoaded();
  });

  it('TC-REC-009 현재 연월 라벨, 일월화수목금토 머리글, 일요일 시작 7열 격자와 오늘 강조(KST 10/27)', async () => {
    await openRecordApp();
    await recordLoaded();
    expect(tid('record.month-label')).toHaveTextContent('2026년 10월');
    expect(tid('record.weekday-header')).toHaveTextContent(t('record.weekday'));
    expect(squash(tid('record.weekday-header').textContent)).toBe('일월화수목금토');
    const cells = Array.from(tid('record.calendar-grid').children);
    expect(cells).toHaveLength(35); // 5주 × 7열
    expect(cells.indexOf(tid('record.day-2026-10-01'))).toBe(4); // 목요일
    expect(cells.indexOf(tid('record.day-2026-10-31'))).toBe(34);
    expect(dayIds()).toHaveLength(31);
    expect(maybe('record.day-2026-09-30')).not.toBeInTheDocument(); // 이전·다음 달 날짜로 채우지 않는다
    expect(maybe('record.day-2026-11-01')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('record.today-marker')).toHaveLength(1);
    expect(within(tid('record.day-2026-10-27')).getByTestId('record.today-marker')).toBeInTheDocument();
  });

  it('TC-REC-011 APPROVED는 썸네일, PENDING은 썸네일 + "사진 반영 중" 배지, 기록 없는 날은 빈 칸이다', async () => {
    await openRecordApp();
    await recordLoaded();
    expect(dayPhotoIds()).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
    expect(tid('record.day-photo-2026-10-20')).toHaveAttribute('src', thumbOf(OCT_20));
    expect(tid('record.day-photo-2026-10-31')).toHaveAttribute('src', thumbOf(OCT_31));
    expect(screen.getAllByTestId(/^record\.day-pending-/).map((el) => el.getAttribute('data-testid'))).toEqual(['record.day-pending-2026-10-27']);
    expect(within(tid('record.day-2026-10-27')).getByTestId('record.day-pending-2026-10-27')).toHaveTextContent(t('record.pending.badge'));
    expect(within(tid('record.day-2026-10-21')).queryByRole('img')).toBeNull();
    expect(tid('record.day-2026-10-21')).toHaveTextContent('21');
  });

  it('TC-REC-015 응답 배열이 날짜 순서가 아니어도 날짜 칸에 정확히 배치된다', async () => {
    await openRecordApp({ routes: { [OCT]: 'record/posts-calendar__2026-10-shuffled' } });
    await recordLoaded();
    expect(dayPhotoIds()).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
    expect(within(tid('record.day-2026-10-27')).getByTestId('record.day-photo-2026-10-27')).toHaveAttribute('src', thumbOf(recPostId(201)));
  });

  it('TC-REC-008 주제 날짜 10/31 사진은 10월 칸에만 있고 11월(KST 11/1 00:30에 연 현재 달)에는 나타나지 않는다', async () => {
    await openRecordApp({
      routes: { [MONTHS_KEY]: () => json(200, monthsBody([2026, 11], [2026, 10])), [NOV]: 'record/posts-calendar__2026-11-empty' },
      beforeRender: (h) => h.clock.setWallClock(Date.parse('2026-10-31T15:30:00Z')),
    });
    await recordLoaded();
    expect(tid('record.month-label')).toHaveTextContent('2026년 11월');
    expect(dayPhotoIds()).toEqual([]);
    expect(maybe('record.day-2026-10-31')).not.toBeInTheDocument();
    click('record.prev-month-button');
    await waitFor(() => expect(maybe('record.day-photo-2026-10-31')).toBeInTheDocument());
    expect(within(tid('record.day-2026-10-31')).getByTestId('record.day-photo-2026-10-31')).toBeInTheDocument();
  });

  it('TC-REC-037 REQ-REC-020 기록이 없는 달은 빈 달력(날짜만 있는 격자)이고 사진 패널도 오류도 없다', async () => {
    await openRecordApp({ routes: { [OCT]: monthResponse(2026, 10) } });
    await recordLoaded();
    expect(tid('record.empty-state')).toBeInTheDocument();
    expect(dayIds()).toHaveLength(31);
    expect(dayPhotoIds()).toEqual([]);
    expect(maybe('record.selected-photo')).not.toBeInTheDocument();
    expect(maybe('record.error-state')).not.toBeInTheDocument();
    expect(maybe('record.view-feed-button')).not.toBeInTheDocument();
  });

  it('REQ-REC-020 기록이 있는 달에는 빈 상태(record.empty-state)가 없다', async () => {
    await openRecordApp();
    await recordLoaded();
    expect(maybe('record.empty-state')).not.toBeInTheDocument();
  });
});

describe('날짜 선택과 사진 패널 (TC-REC-035, 036, REQ-REC-015, 016, 030, 033)', () => {
  it('TC-REC-036 처음에는 가장 최근 기록 날짜(10/31)가 선택(aria-selected)되고 APPROVED 패널에 두 동작이 있다', async () => {
    await openRecordApp();
    await recordLoaded();
    expect(tid('record.day-2026-10-31')).toHaveAttribute('aria-selected', 'true');
    expect(tid('record.day-2026-10-20')).toHaveAttribute('aria-selected', 'false');
    expect(within(tid('record.selected-photo')).getByRole('img')).toHaveAttribute('src', thumbOf(OCT_31));
    expect(tid('record.view-feed-button')).toHaveTextContent(t('record.action.feed'));
    expect(tid('record.view-display-button')).toHaveTextContent(t('record.action.display'));
    expect(maybe('record.pending-badge')).not.toBeInTheDocument(); // APPROVED에는 배지가 없다
  });

  it('REQ-REC-030 날짜 칸을 누르면 그 날짜가 선택되고 사진이 바뀐다. 사진이 없는 칸은 아무 일도 없다', async () => {
    await openRecordApp();
    await recordLoaded();
    click('record.day-2026-10-20');
    expect(tid('record.day-2026-10-20')).toHaveAttribute('aria-selected', 'true');
    expect(tid('record.day-2026-10-31')).toHaveAttribute('aria-selected', 'false');
    expect(within(tid('record.selected-photo')).getByRole('img')).toHaveAttribute('src', thumbOf(OCT_20));
    click('record.day-2026-10-21');
    expect(tid('record.day-2026-10-20')).toHaveAttribute('aria-selected', 'true');
    expect(tid('record.day-2026-10-21')).not.toHaveAttribute('aria-selected', 'true');
    expect(within(tid('record.selected-photo')).getByRole('img')).toHaveAttribute('src', thumbOf(OCT_20));
  });

  it('TC-REC-035 PENDING 날짜를 고르면 배지 "사진 반영 중"이 보이고 액션 버튼은 숨겨지며 상세 API는 호출하지 않는다', async () => {
    const { h } = await openRecordApp();
    await recordLoaded();
    click('record.day-2026-10-27');
    expect(within(tid('record.selected-photo')).getByTestId('record.pending-badge')).toHaveTextContent(t('record.pending.badge'));
    expect(maybe('record.view-feed-button')).not.toBeInTheDocument();
    expect(maybe('record.view-display-button')).not.toBeInTheDocument();
    expect(h.ff.calls.filter((c) => /^\/posts\/[0-9a-f-]{36}/.test(c.path))).toEqual([]);
  });

  it('TC-REC-035 REQ-REC-015 배지를 누르면 안내 "사진을 반영하고 있어요…"를 열고 다시 누르면 닫는다(접근성 이름 열기/닫기)', async () => {
    await openRecordApp();
    await recordLoaded();
    click('record.day-2026-10-27');
    const badge = tid('record.pending-badge');
    expect(maybe('record.pending-tooltip')).not.toBeInTheDocument();
    expect(badge).toHaveAccessibleName(new RegExp(t('record.pending.hint-open')));
    fireEvent.click(badge);
    expect(squash(tid('record.pending-tooltip').textContent)).toBe(squash(t('record.pending.tooltip')));
    expect(tid('record.pending-badge')).toHaveAccessibleName(new RegExp(t('record.pending.hint-close')));
    fireEvent.click(tid('record.pending-badge'));
    expect(maybe('record.pending-tooltip')).not.toBeInTheDocument();
  });

  it('TC-REC-024 삭제 직후(PostChanges removed) 해당 칸이 비고 선택이 같은 달 가장 늦은 사진으로 옮겨 간다', async () => {
    const { h } = await openRecordApp();
    await recordLoaded();
    click('record.day-2026-10-27');
    act(() => h.container.postChanges.publish({ type: 'removed', postId: recPostId(201) }));
    expect(maybe('record.day-photo-2026-10-27')).not.toBeInTheDocument();
    expect(tid('record.day-2026-10-31')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('월 이동·월 선택 (TC-REC-004, 016, 017, REQ-REC-005)', () => {
  it('TC-REC-016 이전·다음 달 화살표로 이동하고 가장 오래된/최신 달에서는 비활성이다', async () => {
    const { fixtures } = await openRecordApp();
    await recordLoaded();
    expect(tid('record.next-month-button')).toBeDisabled();
    expect(tid('record.prev-month-button')).toBeEnabled();
    click('record.prev-month-button');
    await waitFor(() => expect(tid('record.month-label')).toHaveTextContent('2026년 9월'));
    await waitFor(() => expect(maybe('record.day-photo-2026-09-17')).toBeInTheDocument());
    expect(fixtures.calls(SEP)).toHaveLength(1);
    expect(tid('record.prev-month-button')).toBeDisabled();
    expect(tid('record.next-month-button')).toBeEnabled();
    expect(tid('record.day-2026-09-30')).toHaveAttribute('aria-selected', 'true');
    click('record.next-month-button');
    await waitFor(() => expect(tid('record.month-label')).toHaveTextContent('2026년 10월'));
  });

  it('TC-REC-016 처음 가는 달은 기존 기록을 비우고 로딩을 보인다', async () => {
    const gate = deferred<void>();
    await openRecordApp({ routes: { [SEP]: gated(gate, 'record/posts-calendar__2026-09') } });
    await recordLoaded();
    click('record.prev-month-button');
    expect(await screen.findByTestId('record.loading')).toBeInTheDocument();
    expect(maybe('record.day-photo-2026-10-20')).not.toBeInTheDocument();
    await act(async () => gate.resolve());
    await recordLoaded();
  });

  it('TC-REC-004 월 선택 버튼이 시트(제목 "날짜 선택")를 열고 항목은 최신순이며 현재 달이 선택 표시다', async () => {
    await openRecordApp();
    await recordLoaded();
    click('record.month-picker-button');
    const sheet = tid('record.month-picker-sheet');
    expect(sheet).toHaveAttribute('role', 'dialog');
    expect(sheet).toHaveAccessibleName(t('record.picker.title'));
    const items = within(sheet).getAllByTestId(/^record\.month-picker-item-/).map((el) => el.getAttribute('data-testid')!.slice('record.month-picker-item-'.length));
    expect(items).toEqual(['2026-10', '2026-09']);
    expect(tid('record.month-picker-item-2026-10')).toHaveAttribute('aria-selected', 'true');
    expect(tid('record.month-picker-item-2026-09')).toHaveAttribute('aria-selected', 'false');
  });

  it('TC-REC-003 월 목록에 현재 달이 없어도 선택지에 현재 달 항목이 있다(기록이 없어도 존재)', async () => {
    await openRecordApp({ routes: { [MONTHS_KEY]: 'record/posts-calendar-months__without-current', [OCT]: monthResponse(2026, 10) } });
    await recordLoaded();
    click('record.month-picker-button');
    expect(tid('record.month-picker-item-2026-10')).toBeInTheDocument();
    expect(tid('record.month-picker-item-2026-09')).toBeInTheDocument();
  });

  it('TC-REC-004 항목을 고르면 그 달로 이동하고 시트가 닫힌다. 기록 없는 달은 빈 달로 보인다', async () => {
    await openRecordApp({ routes: { [MONTHS_KEY]: () => json(200, monthsBody([2026, 10], [2026, 9], [2026, 8])) } });
    await recordLoaded();
    click('record.month-picker-button');
    click('record.month-picker-item-2026-08');
    expect(maybe('record.month-picker-sheet')).not.toBeInTheDocument();
    await waitFor(() => expect(tid('record.month-label')).toHaveTextContent('2026년 8월'));
    await waitFor(() => expect(maybe('record.empty-state')).toBeInTheDocument());
    expect(dayIds()).toHaveLength(31);
  });

  it('TC-REC-017 지금 보는 달 항목을 다시 고르면 시트만 닫히고 calendar 재요청이 없다', async () => {
    const { fixtures } = await openRecordApp();
    await recordLoaded();
    click('record.month-picker-button');
    click('record.month-picker-item-2026-10');
    expect(maybe('record.month-picker-sheet')).not.toBeInTheDocument();
    expect(fixtures.calls(OCT)).toHaveLength(1);
  });

  it('닫기 버튼과 Esc는 선택 없이 시트를 닫고 포커스가 월 선택 버튼으로 돌아온다', async () => {
    await openRecordApp();
    await recordLoaded();
    click('record.month-picker-button');
    click('record.month-picker-close-button');
    expect(maybe('record.month-picker-sheet')).not.toBeInTheDocument();
    expect(tid('record.month-label')).toHaveTextContent('2026년 10월');
    fireEvent.click(tid('record.month-picker-button'));
    expect(tid('record.month-picker-sheet')).toBeInTheDocument();
    fireEvent.keyDown(tid('record.month-picker-sheet'), { key: 'Escape' });
    expect(maybe('record.month-picker-sheet')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(tid('record.month-picker-button'));
  });
});

describe('오류 화면 (REQ-REC-024, TC-REC-029~032)', () => {
  it('TC-REC-032 서버 500이면 "기록을 불러오지 못했어요" + "다시 시도"이고 다시 시도하면 달력이 열린다', async () => {
    const { fixtures } = await openRecordApp({ routes: { [OCT]: 'record/posts-calendar__500-server-error' }, waitFor: null });
    expect(await screen.findByTestId('record.error-state')).toBeInTheDocument();
    expect(tid('record.error-message')).toHaveTextContent(t('record.err.other'));
    expect(tid('record.retry-button')).toHaveTextContent(t('common.retry'));
    expect(maybe('record.day-photo-2026-10-20')).not.toBeInTheDocument();
    fixtures.set(OCT, 'record/posts-calendar__2026-10');
    click('record.retry-button');
    await recordLoaded();
    expect(maybe('record.error-state')).not.toBeInTheDocument();
  });

  it.each([
    ['TC-REC-012 월 불일치', 'record/posts-calendar__month-mismatch'],
    ['TC-REC-013 날짜 범위 밖', 'record/posts-calendar__date-out-of-month'],
    ['TC-REC-013 날짜 중복', 'record/posts-calendar__duplicate-date'],
    ['TC-REC-013 빈 썸네일', 'record/posts-calendar__empty-thumbnail'],
    ['TC-REC-014 알 수 없는 상태', 'record/posts-calendar__unknown-status'],
  ])('%s: 계약 위반 응답은 "기록을 불러오지 못했어요" + 다시 시도다(앱은 깨지지 않는다)', async (_name, fixture) => {
    await openRecordApp({ routes: { [OCT]: fixture }, waitFor: null });
    expect(await screen.findByTestId('record.error-state')).toBeInTheDocument();
    expect(tid('record.error-message')).toHaveTextContent(t('record.err.other'));
    expect(tid('record.retry-button')).toBeInTheDocument();
  });

  it('TC-REC-031 서버 400 "조회 연월이 올바르지 않습니다."는 "조회할 수 없는 연월이에요"로 보이고 월 헤더는 그대로 이동할 수 있다', async () => {
    await openRecordApp({ routes: { [OCT]: 'record/posts-calendar__400-invalid-month' }, waitFor: null });
    expect(await screen.findByTestId('record.invalid-month-message')).toHaveTextContent(t('record.err.400'));
    expect(maybe('record.login-required-state')).not.toBeInTheDocument();
    expect(tid('record.month-label')).toHaveTextContent('2026년 10월');
    expect(tid('record.prev-month-button')).toBeEnabled();
  });

  it('TC-REC-030 인증 불가 401이면 "로그인이 필요해요" + "로그인 하기"이고 버튼은 로그인 화면으로 보낸다', async () => {
    const { router } = await openRecordApp({
      routes: { [OCT]: 'record/posts-calendar__401-unauthorized', [MONTHS_KEY]: 'record/posts-calendar__401-unauthorized' },
      waitFor: null,
      beforeRender: (h) => h.ff.route('POST /auth/refresh', () => json(200, refreshSuccessBody)),
    });
    expect(await screen.findByTestId('record.login-required-state')).toHaveTextContent(t('record.err.401'));
    expect(tid('record.login-button')).toHaveTextContent(t('record.guest.login'));
    expect(maybe('record.retry-button')).not.toBeInTheDocument();
    click('record.login-button');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('TC-REC-030 refresh가 REAUTHENTICATION_REQUIRED면 세션이 만료되어 로그인 화면으로 이동한다', async () => {
    const { router } = await openRecordApp({
      routes: { [OCT]: 'record/posts-calendar__401-unauthorized', [MONTHS_KEY]: 'record/posts-calendar__401-unauthorized' },
      waitFor: null,
      beforeRender: (h) => h.ff.route('POST /auth/refresh', () => json(401, { errorCode: 'REAUTHENTICATION_REQUIRED', message: '재인증이 필요합니다.' })),
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('TC-REC-029 오프라인 첫 진입은 "네트워크 연결을 확인해 주세요." + 다시 시도이고 온라인 복귀 후 다시 시도하면 로드된다', async () => {
    const offline = () => Promise.reject(new TypeError('Failed to fetch'));
    const { fixtures } = await openRecordApp({ routes: { [OCT]: offline, [MONTHS_KEY]: offline }, waitFor: null });
    expect(await screen.findByTestId('record.error-state', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(tid('record.error-message')).toHaveTextContent(t('common.error.network'));
    fixtures.set(OCT, 'record/posts-calendar__2026-10');
    fixtures.set(MONTHS_KEY, 'record/posts-calendar-months__recent-first');
    click('record.retry-button');
    await recordLoaded();
  });
});

describe('캐시 재검증과 토스트 (TC-REC-020~022, 029)', () => {
  it('TC-REC-020 이전에 본 달로 돌아오면 응답 전에도 캐시한 기록을 보여 주고 최신 값으로 교체한다', async () => {
    const gate = deferred<void>();
    await openRecordApp({
      routes: {
        [SEP]: [
          'record/posts-calendar__2026-09',
          async () => {
            await gate.promise;
            return json(200, { year: 2026, month: 9, posts: [{ topicDate: '2026-09-17', postId: recPostId(297), thumbnailImageUrl: thumbOf(recPostId(297)), status: 'APPROVED' }] });
          },
        ],
      },
    });
    await recordLoaded();
    click('record.prev-month-button');
    await waitFor(() => expect(maybe('record.day-photo-2026-09-30')).toBeInTheDocument());
    click('record.next-month-button');
    await waitFor(() => expect(tid('record.month-label')).toHaveTextContent('2026년 10월'));
    click('record.prev-month-button');
    expect(await screen.findByTestId('record.day-photo-2026-09-30')).toBeInTheDocument(); // 응답 전 캐시
    expect(maybe('record.loading')).not.toBeInTheDocument();
    await act(async () => gate.resolve());
    await waitFor(() => expect(maybe('record.day-photo-2026-09-30')).not.toBeInTheDocument());
    expect(maybe('record.day-photo-2026-09-17')).toBeInTheDocument();
  });

  it('TC-REC-021 캐시된 달의 재조회가 실패하면 캐시를 유지하고 토스트 "기록을 불러오지 못했어요"가 2.5초 동안 뜬다', async () => {
    const { h } = await openRecordApp({ routes: { [SEP]: ['record/posts-calendar__2026-09', 'record/posts-calendar__500-server-error'] } });
    await recordLoaded();
    click('record.prev-month-button');
    await waitFor(() => expect(maybe('record.day-photo-2026-09-30')).toBeInTheDocument());
    click('record.next-month-button');
    await waitFor(() => expect(tid('record.month-label')).toHaveTextContent('2026년 10월'));
    click('record.prev-month-button');
    await waitFor(() => expect(toastText()).toBe(t('record.err.other')));
    expect(maybe('record.day-photo-2026-09-30')).toBeInTheDocument();
    expect(maybe('record.error-state')).not.toBeInTheDocument();
    await advanceApp(h, TOAST_DURATION_MS - 100);
    expect(toastText()).toBe(t('record.err.other'));
    await advanceApp(h, 200);
    expect(toastText()).toBeNull();
  });

  it('TC-REC-022 기록 탭을 다시 누르면(재선택) 보이는 달을 재검증한다', async () => {
    const { fixtures } = await openRecordApp();
    await recordLoaded();
    expect(fixtures.calls(OCT)).toHaveLength(1);
    click('bottom-bar.tab-record');
    await waitFor(() => expect(fixtures.calls(OCT)).toHaveLength(2));
    expect(maybe('record.loading')).not.toBeInTheDocument(); // 기존 기록을 유지하며 교체한다
  });

  it('TC-REC-022 문서가 숨겨졌다 다시 보이면(포그라운드 복귀) 재검증한다', async () => {
    const { fixtures } = await openRecordApp();
    await recordLoaded();
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    state.mockReturnValue('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(fixtures.calls(OCT)).toHaveLength(2));
    state.mockRestore();
  });
});

describe('이미지로 저장 (TC-REC-038~040)', () => {
  it('TC-REC-038 "이미지로 저장"을 누르면 chalkak-calendar-2026-10.png가 PNG로 저장되고 토스트가 한 번 뜬다', async () => {
    const { h } = await openRecordApp();
    await recordLoaded();
    expect(tid('record.save-image-button')).toHaveTextContent(t('record.save'));
    click('record.save-image-button');
    await waitFor(() => expect(toastText()).toBe(t('record.save.ok')));
    expect(h.downloader.files.map((f) => f.name)).toEqual(['chalkak-calendar-2026-10.png']);
    expect(h.downloader.files[0]!.blob.type).toBe('image/png');
    expect(h.calendarExporter.models).toHaveLength(1);
    expect(h.calendarExporter.models[0]).toMatchObject({ year: 2026, month: 10 });
  });

  it('TC-REC-039 저장 실패면 "이미지 저장에 실패했어요" 토스트이고 화면은 그대로다', async () => {
    const { h } = await openRecordApp();
    await recordLoaded();
    h.downloader.fail = new Error('disk');
    click('record.save-image-button');
    await waitFor(() => expect(toastText()).toBe(t('record.save.fail')));
    expect(tid('record.calendar-grid')).toBeInTheDocument();
  });

  it('TC-REC-040 저장 중 버튼 연타는 1회만 저장한다', async () => {
    const { h } = await openRecordApp();
    await recordLoaded();
    h.calendarExporter.hold();
    click('record.save-image-button');
    click('record.save-image-button');
    click('record.save-image-button');
    await act(async () => h.calendarExporter.release());
    await waitFor(() => expect(h.downloader.files).toHaveLength(1));
    expect(h.calendarExporter.models).toHaveLength(1);
  });
});
