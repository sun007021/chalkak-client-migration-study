import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES } from '../../app/paths';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useViewModel } from '../../core/state/useViewModel';
import { formatDateString } from '../../core/time/kst';
import { LoadingIndicator } from '../../core/ui/StateViews';
import { useDialogFocus } from '../../core/ui/useDialogFocus';
import { useRovingTabIndex } from '../../core/ui/useRovingTabIndex';
import { useShellContext } from '../shell/MainShell';
import type { CalendarPost, YearMonth } from './recordModels';
import { monthGrid, monthKey, monthLabel, nextPhotoDate } from './recordMonths';
import type { GridKey } from './recordMonths';
import { RouterRecordNavigator } from './recordNavigation';
import type { RecordErrorKind, RecordState, RecordViewModel } from './RecordViewModel';
import { useRecordUrlSync } from './useRecordUrlSync';

/**
 * 기록 탭 화면. 로직은 RecordViewModel에 있고 여기서는 그리기만 한다.
 * ViewModel은 컨테이너가 모드별로 보관하므로(recordSession) 화면은 붙고 떨어질 뿐이다: 붙으면 이동 수단을 꽂고 URL의 date를 반영해 onShown,
 * 문서가 다시 보이면 onShown, 숨겨지거나 떨어지면 onHidden. 탭 재선택은 보이는 달을 재검증한다. 선택 날짜가 바뀌면 URL의 date를 replace로 맞춘다.
 */
export function RecordScreen(): ReactNode {
  const { mode, shell } = useShellContext();
  const container = useContainer();
  const navigate = useNavigate();
  useScreenView('record');
  const { viewModel: vm, navigator } = container.recordSession(mode);

  // URL ↔ 상태(마운트, Link·주소 변경, 날짜 선택). applyRoute가 먼저 돌도록 라이프사이클 효과보다 앞에 둔다.
  const state = useViewModel(vm);
  useRecordUrlSync(vm, state);

  useEffect(() => {
    const detach = navigator.attach(new RouterRecordNavigator((to, options) => navigate(to, options)));
    void vm.onShown();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') vm.onHidden();
      else void vm.onShown();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const offReselect = shell.subscribeReselect((tab) => {
      if (tab === 'record') void vm.onTabReselect();
    });
    return () => {
      offReselect();
      document.removeEventListener('visibilitychange', onVisibility);
      vm.onHidden();
      detach();
    };
  }, [vm, navigator, navigate, shell]);

  return <RecordView vm={vm} state={state} onLogin={() => void navigate(ROUTES.login)} />;
}

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const plainButton: CSSProperties = { border: 0, padding: 0, background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer' };
const weekdayRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: 12, color: '#666', padding: '4px 0' };
const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 };
const cellStyle: CSSProperties = { position: 'relative', aspectRatio: '1 / 1', minWidth: 0, borderRadius: 6, overflow: 'hidden', background: '#f2f2f2', fontSize: 12, textAlign: 'left' };
const dayNumberStyle: CSSProperties = { position: 'absolute', top: 2, left: 4, padding: '0 3px', borderRadius: 4, background: 'rgba(255,255,255,0.8)', color: '#111', lineHeight: 1.3 };
const thumbStyle: CSSProperties = { display: 'block', width: '100%', height: '100%', objectFit: 'cover' };

function RecordView({ vm, state, onLogin }: { vm: RecordViewModel; state: RecordState; onLogin: () => void }): ReactNode {
  const { body } = state;
  return (
    <div data-testid="record.root" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}>
      <MonthHeader vm={vm} state={state} />
      {body.status === 'loading' ? <LoadingIndicator screenId="record" /> : null}
      {body.status === 'error' ? <ErrorView kind={body.kind} onRetry={() => void vm.retry()} onLogin={onLogin} /> : null}
      {body.status === 'ready' ? (
        <>
          <Calendar vm={vm} state={state} posts={body.posts} />
          {body.posts.length === 0 ? (
            <div data-testid="record.empty-state" style={{ padding: 16, textAlign: 'center' }}>
              {webOnlyCopy['record.empty']}
            </div>
          ) : null}
          {state.selectedPost ? <SelectedPhoto vm={vm} state={state} post={state.selectedPost} /> : null}
          <div style={{ padding: '8px 16px' }}>
            <button type="button" data-testid="record.save-image-button" disabled={state.saving} onClick={() => void vm.saveImage()}>
              {t('record.save')}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MonthHeader({ vm, state }: { vm: RecordViewModel; state: RecordState }): ReactNode {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerButton = useRef<HTMLButtonElement | null>(null);
  return (
    <header style={{ padding: '12px 16px' }}>
      <div style={rowStyle}>
        <button type="button" data-testid="record.prev-month-button" aria-label={webOnlyCopy['record.nav.previous']} disabled={!state.canGoPrevious} onClick={() => void vm.selectPreviousMonth()}>
          <span aria-hidden="true">‹</span>
        </button>
        <button
          ref={pickerButton}
          type="button"
          data-testid="record.month-picker-button"
          aria-haspopup="dialog"
          style={plainButton}
          onClick={() => {
            // 사파리 등은 버튼을 눌러도 포커스가 옮겨 오지 않고 jsdom의 fireEvent.click도 마찬가지다.
            // 이 줄이 없으면 시트를 닫을 때 포커스가 body로 돌아가므로 명시적으로 옮긴다(제거하지 말 것).
            pickerButton.current?.focus();
            setPickerOpen(true);
          }}
        >
          <span data-testid="record.month-label" aria-live="polite">{monthLabel(state.month)}</span>
        </button>
        <button type="button" data-testid="record.next-month-button" aria-label={webOnlyCopy['record.nav.next']} disabled={!state.canGoNext} onClick={() => void vm.selectNextMonth()}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      {pickerOpen ? (
        <MonthPickerSheet
          months={state.availableMonths}
          current={state.month}
          onSelect={(ym) => {
            setPickerOpen(false);
            void vm.selectMonth(ym);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </header>
  );
}

/** 월 선택 시트: 선택지(최신순)를 목록으로 보이고, 고르면 이동하며 닫힌다. Esc·닫기로 닫으면 포커스가 월 선택 버튼으로 돌아온다. */
function MonthPickerSheet({ months, current, onSelect, onClose }: { months: YearMonth[]; current: YearMonth; onSelect: (ym: YearMonth) => void; onClose: () => void }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const selectedItem = useRef<HTMLButtonElement | null>(null);
  useDialogFocus(ref, onClose, selectedItem);
  useEffect(() => {
    selectedItem.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const onListKeyDown = useRovingTabIndex('option');
  return (
    <div ref={ref} data-testid="record.month-picker-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ padding: 12, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8 }}>
      <h2 id={titleId} style={{ margin: '0 0 8px', fontSize: 16 }}>
        {t('record.picker.title')}
      </h2>
      <div role="listbox" aria-labelledby={titleId} onKeyDown={onListKeyDown} style={{ display: 'flex', flexDirection: 'column', maxHeight: '50vh', overflowY: 'auto' }}>
        {months.map((ym) => {
          const selected = ym.year === current.year && ym.month === current.month;
          return (
            <button
              key={monthKey(ym)}
              ref={selected ? selectedItem : undefined}
              type="button"
              role="option"
              tabIndex={selected ? 0 : -1}
              data-testid={`record.month-picker-item-${monthKey(ym)}`}
              aria-selected={selected}
              style={{ ...plainButton, padding: '8px 4px', textAlign: 'left', fontWeight: selected ? 700 : 400 }}
              onClick={() => onSelect(ym)}
            >
              {monthLabel(ym)}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="button" data-testid="record.month-picker-close-button" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}

const GRID_KEYS: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

function Calendar({ vm, state, posts }: { vm: RecordViewModel; state: RecordState; posts: CalendarPost[] }): ReactNode {
  const { year, month } = state.month;
  const byDate = useMemo(() => new Map(posts.map((post) => [post.topicDate, post])), [posts]);
  const cells = useMemo(() => monthGrid({ year, month }).cells, [year, month]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const date = (event.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset['date'];
    if (!date) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      vm.selectDate(date);
      return;
    }
    if (!GRID_KEYS.includes(event.key)) return;
    event.preventDefault();
    const next = nextPhotoDate(
      posts.map((post) => post.topicDate),
      date,
      event.key as GridKey,
    );
    vm.selectDate(next);
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${next}"]`)?.focus();
  };
  return (
    <section style={{ padding: '0 16px' }}>
      <div data-testid="record.weekday-header" style={weekdayRowStyle}>
        {Array.from(t('record.weekday')).map((weekday, index) => (
          <span key={index}>{weekday}</span>
        ))}
      </div>
      {/* 칸이 격자의 직접 자식이어야 해서(7열) 행(row) 래퍼 없이 gridcell을 나열한다. 초점은 선택된 사진 날 하나만 받는다(roving tabindex). */}
      <div ref={gridRef} data-testid="record.calendar-grid" role="grid" aria-label={monthLabel(state.month)} aria-busy={state.body.status === 'ready' && state.body.revalidating} style={gridStyle} onKeyDown={onKeyDown}>
        {cells.map((day, index) => {
          if (day === null) return <div key={`blank-${index}`} role="gridcell" aria-hidden="true" />;
          const date = formatDateString(year, month, day);
          return <DayCell key={date} vm={vm} date={date} day={day} month={month} post={byDate.get(date)} selected={state.selectedDate === date} today={state.today === date} />;
        })}
      </div>
    </section>
  );
}

interface DayCellProps {
  vm: RecordViewModel;
  date: string;
  day: number;
  month: number;
  post: CalendarPost | undefined;
  selected: boolean;
  today: boolean;
}

const DayCell = memo(function DayCell({ vm, date, day, month, post, selected, today }: DayCellProps): ReactNode {
  const marker = today ? <span data-testid="record.today-marker" aria-hidden="true" style={{ position: 'absolute', right: 4, bottom: 4, width: 8, height: 8, borderRadius: '50%', background: '#e5484d' }} /> : null;
  if (!post) {
    return (
      <div role="gridcell" data-testid={`record.day-${date}`} aria-current={today ? 'date' : undefined} style={cellStyle}>
        <span style={{ ...dayNumberStyle, background: 'none', color: '#666' }}>{day}</span>
        {marker}
      </div>
    );
  }
  const label = `${t('display.picker.month', { n: month })} ${t('display.picker.day', { n: day })}${today ? ` ${webOnlyCopy['record.today']}` : ''}`;
  return (
    <div
      role="gridcell"
      tabIndex={selected ? 0 : -1}
      data-testid={`record.day-${date}`}
      data-date={date}
      aria-selected={selected}
      aria-current={today ? 'date' : undefined}
      aria-label={label}
      style={{ ...cellStyle, cursor: 'pointer', outlineOffset: -3, ...(selected ? { outline: '3px solid #111' } : {}) }}
      onClick={() => vm.selectDate(date)}
    >
      {/* crossOrigin: 달력 이미지(canvas)와 같은 캐시 항목을 쓰도록 CORS 모드로 읽는다. */}
      <img data-testid={`record.day-photo-${date}`} src={post.thumbnailImageUrl} alt="" crossOrigin="anonymous" style={thumbStyle} />
      <span aria-hidden="true" style={dayNumberStyle}>
        {day}
      </span>
      {post.status === 'PENDING' ? (
        <span data-testid={`record.day-pending-${date}`} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 2, fontSize: 10, textAlign: 'center', background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
          {t('record.pending.badge')}
        </span>
      ) : null}
      {marker}
    </div>
  );
});

function SelectedPhoto({ vm, state, post }: { vm: RecordViewModel; state: RecordState; post: CalendarPost }): ReactNode {
  const tooltipId = useId();
  const pending = post.status === 'PENDING';
  return (
    <section data-testid="record.selected-photo" style={{ position: 'relative', padding: '12px 16px' }}>
      <img src={post.thumbnailImageUrl} alt={webOnlyCopy['record.selected-photo-alt']} crossOrigin="anonymous" style={{ display: 'block', width: '100%', borderRadius: 8, background: '#e5e5e5' }} />
      {pending ? (
        <div
          style={{ position: 'absolute', top: 20, left: 24 }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && state.pendingHintOpen) {
              event.stopPropagation();
              vm.togglePendingHint();
            }
          }}
        >
          <button
            type="button"
            data-testid="record.pending-badge"
            aria-label={`${t('record.pending.badge')}, ${state.pendingHintOpen ? t('record.pending.hint-close') : t('record.pending.hint-open')}`}
            aria-expanded={state.pendingHintOpen}
            aria-describedby={state.pendingHintOpen ? tooltipId : undefined}
            style={{ ...plainButton, padding: '4px 8px', borderRadius: 12, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 12 }}
            onClick={() => vm.togglePendingHint()}
          >
            {t('record.pending.badge')}
          </button>
          {state.pendingHintOpen ? (
            <p id={tooltipId} data-testid="record.pending-tooltip" style={{ margin: '4px 0 0', padding: 8, borderRadius: 8, background: '#fff', border: '1px solid #e5e5e5', fontSize: 12, whiteSpace: 'pre-line' }}>
              {t('record.pending.tooltip')}
            </p>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" data-testid="record.view-feed-button" onClick={() => vm.openFeed()}>
            {t('record.action.feed')}
          </button>
          <button type="button" data-testid="record.view-display-button" onClick={() => vm.openDisplay()}>
            {t('record.action.display')}
          </button>
        </div>
      )}
    </section>
  );
}

function ErrorView({ kind, onRetry, onLogin }: { kind: RecordErrorKind; onRetry: () => void; onLogin: () => void }): ReactNode {
  if (kind === 'unauthorized') {
    return (
      <div role="alert" data-testid="record.login-required-state" style={{ padding: 16, textAlign: 'center' }}>
        <p>{t('record.err.401')}</p>
        <button type="button" data-testid="record.login-button" onClick={onLogin}>
          {t('record.guest.login')}
        </button>
      </div>
    );
  }
  if (kind === 'invalid-month') {
    return (
      <p role="alert" data-testid="record.invalid-month-message" style={{ padding: 16, textAlign: 'center' }}>
        {t('record.err.400')}
      </p>
    );
  }
  return (
    <div role="alert" data-testid="record.error-state" style={{ padding: 16, textAlign: 'center' }}>
      <p data-testid="record.error-message">{kind === 'network' ? t('common.error.network') : t('record.err.other')}</p>
      <button type="button" data-testid="record.retry-button" onClick={onRetry}>
        {t('common.retry')}
      </button>
    </div>
  );
}
