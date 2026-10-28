import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { refreshOk, unauthorized } from '../../core/http/__testing__/createNetHarness';
import { t } from '../../shared/copy';
import {
  cal,
  createRecordHarness,
  gatedRoute,
  P_1031,
  type RecordHarness,
} from './__testing__/createRecordHarness';
import { RecordScreen } from './RecordScreen';

async function renderRecord(h: RecordHarness, waitForGrid = true) {
  const view = await render(<RecordScreen viewModel={h.viewModel} />);
  if (waitForGrid) await screen.findByTestId('record.calendar-grid');
  return view;
}

const day = (date: string) => screen.getByTestId(`record.day-${date}`);

describe('RecordScreen 달력', () => {
  it('TC-REC-042 기록 화면 식별자(루트, 연월, 이전·다음 달, 월 선택, 요일 헤더, 그리드, 날짜 칸, 사진 패널, 이미지로 저장)가 존재한다', async () => {
    const h = await createRecordHarness();
    await renderRecord(h);
    for (const id of [
      'record.root',
      'record.month-label',
      'record.prev-month-button',
      'record.next-month-button',
      'record.month-picker-button',
      'record.weekday-header',
      'record.calendar-grid',
      'record.day-2026-10-01',
      'record.day-2026-10-31',
      'record.selected-photo',
      'record.save-image-button',
    ]) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('record.month-label')).toHaveTextContent('2026년 10월');
    expect(screen.getByTestId('record.save-image-button')).toHaveTextContent(t('record.save'));
  });

  it('TC-REC-001 응답 전에는 로딩 표시이고 응답 뒤에는 달력이 보인다', async () => {
    const h = await createRecordHarness();
    const gate = gatedRoute(h.router, cal(2026, 10), 'record/posts-calendar__2026-10');
    await renderRecord(h, false);
    expect(await screen.findByTestId('record.loading')).toBeOnTheScreen();
    await act(async () => gate.release());
    expect(await screen.findByTestId('record.calendar-grid')).toBeOnTheScreen();
    expect(screen.queryByTestId('record.loading')).not.toBeOnTheScreen();
  });

  it('TC-REC-009 요일 헤더는 "일월화수목금토"이고 그 달 날짜 칸만 있으며 오늘(KST)만 강조된다', async () => {
    const h = await createRecordHarness();
    await renderRecord(h);
    expect(screen.getByTestId('record.weekday-header')).toHaveTextContent(t('record.weekday'));
    expect(screen.queryByTestId('record.day-2026-09-30')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('record.day-2026-11-01')).not.toBeOnTheScreen();
    expect(within(day('2026-10-27')).getByTestId('record.today-marker')).toBeOnTheScreen();
    expect(screen.getAllByTestId('record.today-marker')).toHaveLength(1);
  });

  it('TC-REC-011 APPROVED는 썸네일, PENDING은 썸네일 + 배지, 기록 없는 날은 빈 칸이다', async () => {
    const h = await createRecordHarness();
    await renderRecord(h);
    expect(screen.getByTestId('record.day-photo-2026-10-20').props.source).toEqual({
      uri: expect.stringContaining('/thumbnail.webp'),
    });
    expect(screen.queryByTestId('record.day-pending-2026-10-20')).not.toBeOnTheScreen();
    expect(screen.getByTestId('record.day-photo-2026-10-27')).toBeOnTheScreen();
    expect(screen.getByTestId('record.day-pending-2026-10-27')).toBeOnTheScreen();
    expect(screen.queryByTestId('record.day-photo-2026-10-15')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('record.day-pending-2026-10-15')).not.toBeOnTheScreen();
  });

  it('TC-REC-015 TC-REC-008 응답 순서와 무관하게, 주제 날짜 10/31 사진은 10월 31일 칸에 있다', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: 'record/posts-calendar__2026-10-shuffled' },
    });
    await renderRecord(h);
    for (const date of ['2026-10-20', '2026-10-27', '2026-10-31']) {
      expect(screen.getByTestId(`record.day-photo-${date}`)).toBeOnTheScreen();
    }
  });

  it('TC-REC-036 선택한 날짜 칸은 selected이고 날짜 칸을 누르면 선택이 옮겨진다', async () => {
    const h = await createRecordHarness();
    await renderRecord(h);
    expect(day('2026-10-31')).toBeSelected();
    await fireEvent.press(day('2026-10-27'));
    expect(day('2026-10-27')).toBeSelected();
    expect(day('2026-10-31')).not.toBeSelected();
  });

  it('TC-REC-037 사진 없는 칸을 눌러도 선택은 그대로이고, 기록 없는 달은 사진 패널이 없으며 오류가 아니다', async () => {
    const h = await createRecordHarness();
    await renderRecord(h);
    await fireEvent.press(day('2026-10-15'));
    expect(day('2026-10-31')).toBeSelected();

    const empty = await createRecordHarness({ now: '2026-08-15T03:00:00Z' });
    await renderRecord(empty);
    expect(screen.queryAllByTestId('record.selected-photo')).toHaveLength(0);
    expect(screen.queryByTestId('record.error-state')).not.toBeOnTheScreen();
  });

  it('TC-REC-004 TC-REC-016 이전·다음 달 화살표로 이동하고 선택지 끝에서는 비활성이다', async () => {
    const h = await createRecordHarness();
    await renderRecord(h);
    expect(screen.getByTestId('record.next-month-button')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('record.prev-month-button'));
    expect(await screen.findByTestId('record.day-2026-09-17')).toBeOnTheScreen();
    expect(screen.getByTestId('record.month-label')).toHaveTextContent('2026년 9월');
    expect(screen.getByTestId('record.prev-month-button')).toBeDisabled();
    expect(h.callsOf(cal(2026, 9))).toBe(1);
  });
});

describe('RecordScreen 월 선택', () => {
  it('TC-REC-004 월 선택 시트에 선택지가 최신순으로 있고 현재 달은 기록이 없어도 존재한다', async () => {
    const h = await createRecordHarness({
      now: '2026-08-15T03:00:00Z',
    });
    await renderRecord(h);
    await fireEvent.press(screen.getByTestId('record.month-picker-button'));
    expect(screen.getByTestId('record.month-picker-sheet')).toBeOnTheScreen();
    for (const id of ['2026-10', '2026-09', '2026-08']) {
      expect(screen.getByTestId(`record.month-picker-item-${id}`)).toBeOnTheScreen();
    }
  });

  it('TC-REC-004 항목을 고르면 그 달로 이동하고 시트가 닫힌다', async () => {
    const h = await createRecordHarness();
    await renderRecord(h);
    await fireEvent.press(screen.getByTestId('record.month-picker-button'));
    await fireEvent.press(screen.getByTestId('record.month-picker-item-2026-09'));
    expect(await screen.findByTestId('record.day-2026-09-17')).toBeOnTheScreen();
    expect(screen.getByTestId('record.month-label')).toHaveTextContent('2026년 9월');
    expect(screen.queryByTestId('record.month-picker-sheet')).not.toBeOnTheScreen();
  });
});

describe('RecordScreen 사진 패널', () => {
  it('TC-REC-034 APPROVED 사진에는 두 동작 버튼이 있고 누르면 상세·전시로 이동한다', async () => {
    const h = await createRecordHarness();
    await renderRecord(h);
    expect(screen.getByTestId('record.view-feed-button')).toHaveTextContent(
      t('record.action.feed'),
    );
    expect(screen.getByTestId('record.view-display-button')).toHaveTextContent(
      t('record.action.display'),
    );
    expect(screen.queryByTestId('record.pending-badge')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('record.view-feed-button'));
    await fireEvent.press(screen.getByTestId('record.view-display-button'));
    expect(h.navigator.details.map((x) => x.postId)).toEqual([P_1031]);
    expect(h.navigator.displays).toEqual(['2026-10-31']);
  });

  it('TC-REC-035 PENDING 날짜는 배지와 안내가 보이고 액션 버튼이 숨겨진다', async () => {
    const h = await createRecordHarness();
    await renderRecord(h);
    await fireEvent.press(day('2026-10-27'));
    const badge = screen.getByTestId('record.pending-badge');
    expect(badge).toHaveTextContent(t('record.pending.badge'));
    expect(screen.queryByTestId('record.view-feed-button')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('record.view-display-button')).not.toBeOnTheScreen();
    expect(h.navigator.details).toEqual([]);
  });

  it('TC-REC-035 REQ-REC-015 배지를 누르면 안내 풍선이 열리고 다시 누르면 닫힌다(접근성 라벨 포함)', async () => {
    const h = await createRecordHarness();
    await renderRecord(h);
    await fireEvent.press(day('2026-10-27'));
    expect(screen.queryByTestId('record.pending-tooltip')).not.toBeOnTheScreen();
    expect(screen.getByLabelText(t('record.pending.hint-open'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('record.pending-badge'));
    const [firstLine, secondLine] = t('record.pending.tooltip').split('\n');
    expect(screen.getByTestId('record.pending-tooltip')).toHaveTextContent(firstLine, {
      exact: false,
    });
    expect(screen.getByTestId('record.pending-tooltip')).toHaveTextContent(secondLine, {
      exact: false,
    });
    expect(screen.getByLabelText(t('record.pending.hint-close'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('record.pending-badge'));
    expect(screen.queryByTestId('record.pending-tooltip')).not.toBeOnTheScreen();
  });
});

describe('RecordScreen 오류와 저장', () => {
  it('TC-REC-032 TC-REC-012 서버 오류면 "기록을 불러오지 못했어요" + 다시 시도이고 누르면 불러온다', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: 'record/posts-calendar__500-server-error' },
    });
    await renderRecord(h, false);
    expect(await screen.findByTestId('record.error-state')).toBeOnTheScreen();
    expect(screen.getByTestId('record.error-message')).toHaveTextContent(t('record.err.other'));
    expect(screen.getByTestId('record.retry-button')).toHaveTextContent(t('common.retry'));
    h.router.set(cal(2026, 10), 'record/posts-calendar__2026-10');
    await fireEvent.press(screen.getByTestId('record.retry-button'));
    expect(await screen.findByTestId('record.calendar-grid')).toBeOnTheScreen();
    expect(screen.queryByTestId('record.error-state')).not.toBeOnTheScreen();
  });

  it('TC-REC-031 400이면 "조회할 수 없는 연월이에요"를 보여 준다', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: 'record/posts-calendar__400-invalid-month' },
    });
    await renderRecord(h, false);
    expect(await screen.findByTestId('record.invalid-month-message')).toHaveTextContent(
      t('record.err.400'),
    );
  });

  it('TC-REC-030 인증 불가면 "로그인이 필요해요" + "로그인 하기"이고 누르면 로그인으로 간다', async () => {
    const h = await createRecordHarness({
      routes: { [cal(2026, 10)]: () => unauthorized(), 'POST /auth/refresh': () => refreshOk() },
    });
    await renderRecord(h, false);
    expect(await screen.findByTestId('record.login-required-state')).toHaveTextContent(
      t('record.err.401'),
      { exact: false },
    );
    expect(screen.getByTestId('record.login-button')).toHaveTextContent(t('record.guest.login'));
    await fireEvent.press(screen.getByTestId('record.login-button'));
    expect(h.authFlow.calls).toEqual(['login']);
  });

  it('TC-REC-038 "이미지로 저장"을 누르면 저장하고 연타해도 1회만 저장한다 (TC-REC-040)', async () => {
    const h = await createRecordHarness();
    await renderRecord(h);
    // 가짜 저장소가 즉시 끝나면 첫 탭이 `await fireEvent.press` 안에서 끝나 두 번째 탭은 "연타"가 아니다. 저장을 붙잡아 둔다.
    let release!: () => void;
    h.imageSaver.behavior = () => new Promise<void>((resolve) => (release = resolve));
    await fireEvent.press(screen.getByTestId('record.save-image-button'));
    await fireEvent.press(screen.getByTestId('record.save-image-button'));
    await act(async () => release());
    expect(h.imageSaver.saved.map((s) => s.fileName)).toEqual(['chalkak-calendar-2026-10.png']);
    expect(h.toast.messages).toEqual([t('record.save.ok')]);
  });

  it('TC-REC-007 화면이 사라지면 onHidden이 불려 포그라운드 구독이 풀린다', async () => {
    const h = await createRecordHarness();
    const view = await renderRecord(h);
    expect(h.visibility.listenerCount).toBe(1);
    await view.unmount();
    expect(h.visibility.listenerCount).toBe(0);
  });
});
