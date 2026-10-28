import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { t } from '../../copy/ko';
import { YESTERDAY, dateRoutes } from '../../test/postRoutes';
import { displayLoaded, openApp, stubScroll } from '../../test/postScreens';

const tid = (id: string) => screen.getByTestId(id);

describe('전시 URL 동기화 연타 (코드리뷰 4)', () => {
  it('이전 날짜를 연달아 두 번 눌러도 늦게 온 중간 URL이 상태를 되돌리지 않고 최종 날짜가 URL과 화면에 남는다', async () => {
    const { router } = await openApp({ routes: { ...dateRoutes('2026-10-25', 'popular', 'display/posts-list__popular-page1', '둘째 날') } });
    await displayLoaded();
    fireEvent.click(tid('display.prev-date-button'));
    fireEvent.click(tid('display.prev-date-button'));
    await waitFor(() => expect(tid('display.date-label')).toHaveTextContent('10월 25일'));
    await act(async () => undefined);
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('date')).toBe('2026-10-25'));
    expect(tid('display.date-label')).toHaveTextContent('10월 25일');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('바깥에서 URL이 바뀌면(링크·주소 변경) 그 날짜로 이동한다', async () => {
    const { router } = await openApp();
    await displayLoaded();
    await act(async () => {
      await router.navigate(`/display?date=${YESTERDAY}&sort=popular`);
    });
    await waitFor(() => expect(tid('display.date-label')).toHaveTextContent('10월 26일'));
  });
});

describe('날짜 선택 시트 접근성 (코드리뷰 2, 11)', () => {
  it('날짜 버튼의 이름에 보이는 날짜가 들어 있다(label-in-name)', async () => {
    await openApp();
    await displayLoaded();
    const button = tid('display.date-picker-button');
    expect(button).toHaveAccessibleName(expect.stringContaining('10월 27일'));
    expect(button).toHaveAccessibleName(expect.stringContaining(t('display.picker.title')));
  });

  it('연·월·일 select에 이름이 있고, Esc로 닫으면 날짜 버튼으로 포커스가 돌아온다', async () => {
    await openApp();
    await displayLoaded();
    const trigger = tid('display.date-picker-button');
    trigger.focus();
    fireEvent.click(trigger);
    const sheet = await screen.findByTestId('display.date-picker-sheet');
    expect(sheet).toHaveAccessibleName(t('display.picker.title'));
    for (const id of ['display.date-picker-year', 'display.date-picker-month', 'display.date-picker-day']) expect(tid(id)).toHaveAccessibleName(expect.stringMatching(/\S/));
    expect(document.activeElement).toBe(tid('display.date-picker-year'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('display.date-picker-sheet')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
  });
});

describe('추천 페이저 (코드리뷰 1)', () => {
  const WIDTH = 300;
  let scrollTo: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
    HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)['clientWidth'];
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)['scrollTo'];
  });
  const openArchive = async () => {
    await openApp({ path: `/display?date=${YESTERDAY}&sort=popular` });
    await displayLoaded();
    return tid('display.featured-pager');
  };
  const scrollTo$ = (pager: HTMLElement, left: number) => {
    pager.scrollLeft = left;
    fireEvent.scroll(pager);
  };

  it('role=group, 이름, tabIndex=0을 갖고 이전은 처음에 비활성이다', async () => {
    const pager = await openArchive();
    expect(pager).toHaveAttribute('role', 'group');
    expect(pager).toHaveAccessibleName(expect.stringMatching(/\S/));
    expect(pager).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: /이전 추천/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /다음 추천/ })).toBeEnabled();
  });

  it('다음 버튼은 다음 페이지 위치로 부드럽게 스크롤하고 도착하면 페이지가 바뀐다', async () => {
    const pager = await openArchive();
    fireEvent.click(screen.getByRole('button', { name: /다음 추천/ }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: WIDTH, behavior: 'smooth' });
    scrollTo$(pager, 100); // 도착 전의 중간 scroll은 페이지를 되돌리지 않는다
    expect(screen.getByRole('button', { name: /이전 추천/ })).toBeDisabled();
    scrollTo$(pager, WIDTH);
    await waitFor(() => expect(screen.getByRole('button', { name: /이전 추천/ })).toBeEnabled());
  });

  it('사용자가 넘겨서 바뀐 페이지는 다시 스크롤(되감김)하지 않는다', async () => {
    const pager = await openArchive();
    scrollTo.mockClear();
    scrollTo$(pager, WIDTH * 2 - 10); // 스냅 지점에서 벗어난 값은 반영하지 않는다
    expect(screen.getByRole('button', { name: /이전 추천/ })).toBeDisabled();
    scrollTo$(pager, WIDTH * 2);
    await waitFor(() => expect(screen.getByRole('button', { name: /이전 추천/ })).toBeEnabled());
    await act(async () => undefined);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('화살표 키로도 넘길 수 있다', async () => {
    const pager = await openArchive();
    fireEvent.keyDown(pager, { key: 'ArrowRight' });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: WIDTH, behavior: 'smooth' });
  });
});

describe('스크롤 복원 재시도 (코드리뷰 6)', () => {
  it('복원 값이 문서 높이를 넘으면 다음 프레임에 한 번 더 시도한다', async () => {
    const scroll = stubScroll();
    await openApp();
    await displayLoaded();
    scroll.set(480);
    fireEvent.click(tid(`display.item-${'22222222-2222-4222-8222-222222222202'}`));
    await screen.findByTestId('feed.root');
    scroll.scrollTo.mockClear();
    fireEvent.click(await screen.findByTestId('feed.back-button'));
    await screen.findByTestId('display.grid');
    await waitFor(() => expect(scroll.tops().filter((top) => top === 480).length).toBeGreaterThanOrEqual(2)); // jsdom 문서 높이는 0이라 항상 넘는다
  });
});
