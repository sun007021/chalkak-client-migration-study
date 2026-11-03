import { vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { OCT } from '../../test/recordRoutes';
import { advanceApp, openRecordApp, recordLoaded } from '../../test/recordScreens';

vi.setConfig({ testTimeout: 15_000 });

const tid = (id: string) => screen.getByTestId(id);
const key = (id: string, k: string) => fireEvent.keyDown(tid(id), { key: k });
const selectedDay = () => Array.from(tid('record.calendar-grid').querySelectorAll('[aria-selected="true"]')).map((el) => el.getAttribute('data-testid'));

describe('달력 접근성 (grid / gridcell, roving tabindex)', () => {
  it('격자는 role=grid이고 칸은 gridcell이다. 사진이 있는 날만 초점을 받고 선택된 칸만 tabIndex=0이다', async () => {
    await openRecordApp();
    await recordLoaded();
    expect(tid('record.calendar-grid')).toHaveAttribute('role', 'grid');
    const focusable = Array.from(tid('record.calendar-grid').querySelectorAll('[tabindex]'));
    expect(focusable.map((el) => el.getAttribute('data-testid'))).toEqual(['record.day-2026-10-20', 'record.day-2026-10-27', 'record.day-2026-10-31']);
    expect(focusable.map((el) => el.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    expect(tid('record.day-2026-10-31')).toHaveAttribute('role', 'gridcell');
    expect(tid('record.day-2026-10-21')).toHaveAttribute('role', 'gridcell');
    expect(tid('record.day-2026-10-21')).not.toHaveAttribute('tabindex');
  });

  it('←/→는 이웃한 사진 날로 선택과 초점을 옮기고 끝에서는 머문다', async () => {
    await openRecordApp();
    await recordLoaded();
    key('record.day-2026-10-31', 'ArrowLeft');
    expect(selectedDay()).toEqual(['record.day-2026-10-27']);
    expect(document.activeElement).toBe(tid('record.day-2026-10-27'));
    expect(tid('record.day-2026-10-27')).toHaveAttribute('tabindex', '0');
    key('record.day-2026-10-27', 'ArrowLeft');
    key('record.day-2026-10-20', 'ArrowLeft');
    expect(selectedDay()).toEqual(['record.day-2026-10-20']);
    key('record.day-2026-10-20', 'ArrowRight');
    expect(selectedDay()).toEqual(['record.day-2026-10-27']);
  });

  it('↑/↓는 7일 위·아래 방향에서 가장 가까운 사진 날로, 없으면 머문다. Home/End는 처음/끝이다', async () => {
    await openRecordApp();
    await recordLoaded();
    key('record.day-2026-10-31', 'ArrowUp'); // 24일 이전 중 가장 가까운 날
    expect(selectedDay()).toEqual(['record.day-2026-10-20']);
    key('record.day-2026-10-20', 'ArrowUp');
    expect(selectedDay()).toEqual(['record.day-2026-10-20']);
    key('record.day-2026-10-20', 'ArrowDown'); // 27일 이후 중 가장 가까운 날
    expect(selectedDay()).toEqual(['record.day-2026-10-27']);
    key('record.day-2026-10-27', 'End');
    expect(selectedDay()).toEqual(['record.day-2026-10-31']);
    key('record.day-2026-10-31', 'Home');
    expect(selectedDay()).toEqual(['record.day-2026-10-20']);
    key('record.day-2026-10-20', 'ArrowDown');
    key('record.day-2026-10-27', 'ArrowDown'); // 34일 이후는 없다
    expect(selectedDay()).toEqual(['record.day-2026-10-27']);
  });

  it('Enter로도 사진 날을 선택한다', async () => {
    await openRecordApp();
    await recordLoaded();
    key('record.day-2026-10-20', 'Enter');
    expect(selectedDay()).toEqual(['record.day-2026-10-20']);
  });
});

describe('월 선택 시트 접근성', () => {
  it('열면 선택된 월 항목에 초점이 있고 그 항목만 tabIndex=0이다', async () => {
    await openRecordApp();
    await recordLoaded();
    fireEvent.click(tid('record.month-picker-button'));
    expect(document.activeElement).toBe(tid('record.month-picker-item-2026-10'));
    expect(tid('record.month-picker-item-2026-10')).toHaveAttribute('tabindex', '0');
    expect(tid('record.month-picker-item-2026-09')).toHaveAttribute('tabindex', '-1');
  });

  it('↑/↓로 항목 사이를 오가고 Home/End는 처음/끝이다', async () => {
    await openRecordApp();
    await recordLoaded();
    fireEvent.click(tid('record.month-picker-button'));
    const sheet = tid('record.month-picker-sheet');
    const list = within(sheet).getByRole('listbox');
    fireEvent.keyDown(tid('record.month-picker-item-2026-10'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(tid('record.month-picker-item-2026-09'));
    fireEvent.keyDown(tid('record.month-picker-item-2026-09'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(tid('record.month-picker-item-2026-10'));
    fireEvent.keyDown(tid('record.month-picker-item-2026-10'), { key: 'End' });
    expect(document.activeElement).toBe(tid('record.month-picker-item-2026-09'));
    expect(list).toBeInTheDocument();
  });
});

describe('배지 안내와 상태 알림 접근성', () => {
  it('배지의 접근성 이름은 보이는 글자를 포함하고, 열리면 aria-describedby로 안내와 이어지며 Esc로 닫힌다', async () => {
    await openRecordApp();
    await recordLoaded();
    fireEvent.click(tid('record.day-2026-10-27'));
    const badge = tid('record.pending-badge');
    expect(badge).toHaveAccessibleName(`${t('record.pending.badge')}, ${t('record.pending.hint-open')}`);
    expect(badge).not.toHaveAttribute('aria-describedby');
    fireEvent.click(badge);
    const tooltip = tid('record.pending-tooltip');
    expect(tooltip).not.toHaveAttribute('role', 'tooltip');
    expect(badge).toHaveAttribute('aria-describedby', tooltip.id);
    expect(badge).toHaveAccessibleName(`${t('record.pending.badge')}, ${t('record.pending.hint-close')}`);
    fireEvent.keyDown(badge, { key: 'Escape' });
    expect(screen.queryByTestId('record.pending-tooltip')).not.toBeInTheDocument();
  });

  it('월 라벨은 aria-live=polite이고 재검증 중에는 달력이 aria-busy이다', async () => {
    const gate = deferred<void>();
    await openRecordApp({ routes: { [OCT]: ['record/posts-calendar__2026-10', gated(gate, 'record/posts-calendar__2026-10')] } });
    await recordLoaded();
    expect(tid('record.month-label')).toHaveAttribute('aria-live', 'polite');
    expect(tid('record.calendar-grid')).toHaveAttribute('aria-busy', 'false');
    fireEvent.click(tid('bottom-bar.tab-record'));
    await waitFor(() => expect(tid('record.calendar-grid')).toHaveAttribute('aria-busy', 'true'));
    await act(async () => gate.resolve());
    await waitFor(() => expect(tid('record.calendar-grid')).toHaveAttribute('aria-busy', 'false'));
  });

  it('오류 화면은 role=alert로 알린다', async () => {
    const { h, fixtures } = await openRecordApp({ routes: { [OCT]: 'record/posts-calendar__500-server-error' }, waitFor: null });
    await waitFor(() => expect(fixtures.calls(OCT).length).toBeGreaterThan(0));
    await advanceApp(h, 2000);
    expect(await screen.findByRole('alert')).toBe(tid('record.error-state'));
  });

  it('조회할 수 없는 연월과 로그인 필요 화면도 role=alert이다', async () => {
    await openRecordApp({ routes: { [OCT]: 'record/posts-calendar__400-invalid-month' }, waitFor: null });
    expect(await screen.findByRole('alert')).toBe(tid('record.invalid-month-message'));
  });
});
