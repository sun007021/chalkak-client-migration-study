import { act, fireEvent, screen } from '@testing-library/react';
import { editorFakes, renderEditor, settle } from '../../../test/editorHarness';
import { imageFile } from '../../../test/FakeImageDecoder';

const id = (name: string) => screen.getByTestId(`photo-edit.${name}`);
const maybe = (name: string) => screen.queryByTestId(`photo-edit.${name}`);
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(id(name));
  });
  await act(async () => settle());
};
async function open(options: Parameters<typeof renderEditor>[0] = {}) {
  const view = renderEditor(options);
  await act(async () => settle());
  return view;
}
const key = async (el: Element, k: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    fireEvent.keyDown(el, { key: k, ...init });
  });
};

describe('코드 리뷰 1: 자르기 프레임 키보드', () => {
  it('이동 영역과 모서리 손잡이는 이름이 있는 초점 가능한 요소이고 프레임은 보조기기에서 숨겨지지 않는다', async () => {
    await open();
    const area = id('crop-area');
    const handles = area.querySelectorAll<HTMLElement>('[data-handle]');
    expect(handles).toHaveLength(5);
    for (const handle of handles) {
      expect(handle.tabIndex, handle.dataset.handle).toBe(0);
      expect(handle.getAttribute('aria-label') ?? '', handle.dataset.handle).not.toBe('');
      expect(handle.getAttribute('role')).toBeTruthy();
      expect(handle.closest('[aria-hidden="true"]')).toBeNull();
    }
    expect(area.querySelector('[aria-hidden="true"][data-handle]')).toBeNull();
  });

  it('방향키는 1%, Shift+방향키는 10% 움직인다(이동 영역)', async () => {
    await open();
    await click('ratio-1-1'); // 폭 0.75라 좌우로 움직일 수 있다
    const area = id('crop-area');
    const move = area.querySelector('[data-handle="move"]')!;
    await key(move, 'ArrowRight');
    expect(area.dataset.centerX).toBe('0.5100');
    await key(move, 'ArrowLeft', { shiftKey: true });
    expect(area.dataset.centerX).toBe('0.4100');
    expect(area.dataset.width).toBe('0.7500');
  });

  it('모서리 손잡이의 방향키는 그 모서리를 움직여 영역 크기를 바꾼다', async () => {
    await open();
    const area = id('crop-area');
    const handle = area.querySelector('[data-handle="bottom-right"]')!;
    await key(handle, 'ArrowLeft');
    expect(area.dataset.width).toBe('0.9900');
    await key(handle, 'ArrowUp', { shiftKey: true });
    expect(area.dataset.height).toBe('0.9000');
  });

  it('방향키가 아닌 키는 무시한다', async () => {
    await open();
    const area = id('crop-area');
    await key(area.querySelector('[data-handle="move"]')!, 'a');
    expect(area.dataset.width).toBe('1.0000');
  });
});

describe('코드 리뷰 4: tab/radio 묶음의 roving tabindex', () => {
  it('선택된 항목만 tabIndex 0이고 나머지는 -1이다', async () => {
    await open();
    expect(['crop', 'adjust', 'filter'].map((t) => (id(`tab-${t}`) as HTMLElement).tabIndex)).toEqual([0, -1, -1]);
    expect(['original', 'free', '1-1', '16-9'].map((r) => (id(`ratio-${r}`) as HTMLElement).tabIndex)).toEqual([-1, 0, -1, -1]);
    await click('tab-filter');
    expect(['original', 'mono', 'vivid'].map((f) => (id(`filter-${f}`) as HTMLElement).tabIndex)).toEqual([0, -1, -1]);
    await click('tab-adjust');
    expect((id('adjust-item-auto') as HTMLElement).tabIndex).toBe(0);
    expect((id('adjust-item-exposure') as HTMLElement).tabIndex).toBe(-1);
  });

  it('탭은 좌우 화살표·Home·End로 초점만 옮기고 선택은 Enter/클릭이 한다', async () => {
    await open();
    const crop = id('tab-crop');
    crop.focus();
    await key(crop, 'ArrowRight');
    expect(document.activeElement).toBe(id('tab-adjust'));
    expect(id('tab-crop')).toHaveAttribute('aria-selected', 'true');
    await key(document.activeElement!, 'End');
    expect(document.activeElement).toBe(id('tab-filter'));
    await key(document.activeElement!, 'ArrowRight');
    expect(document.activeElement).toBe(id('tab-crop')); // 끝에서 처음으로
    await key(document.activeElement!, 'Home');
    expect(document.activeElement).toBe(id('tab-crop'));
  });

  it('라디오는 화살표로 초점과 선택이 함께 옮겨 간다', async () => {
    await open();
    const free = id('ratio-free');
    free.focus();
    await key(free, 'ArrowRight');
    await act(async () => settle());
    expect(document.activeElement).toBe(id('ratio-1-1'));
    expect(id('ratio-1-1')).toHaveAttribute('aria-checked', 'true');
    await key(document.activeElement!, 'ArrowLeft');
    await act(async () => settle());
    expect(id('ratio-free')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('코드 리뷰 5: 어둡게 하는 그림자가 편집기 UI를 덮지 않는다', () => {
  it('미리보기 무대는 position relative, overflow hidden이다', async () => {
    await open();
    const stage = id('preview-image').parentElement!.parentElement!;
    expect(stage.style.position).toBe('relative');
    expect(stage.style.overflow).toBe('hidden');
  });
});

describe('코드 리뷰 10 11 13: 보조기기 이름과 알림', () => {
  it('상태 알림 영역(role=status)은 처음부터 있고, 완료 중 표시는 그 안에 들어온다', async () => {
    const fakes = editorFakes();
    await open({ fakes });
    const live = document.querySelector('[role="status"]');
    expect(live).not.toBeNull();
    expect(maybe('rendering-indicator')).not.toBeInTheDocument();
    await click('tab-filter');
    const gate = fakes.preview.hold();
    await click('filter-cool');
    await click('done-button');
    expect(live!.contains(id('rendering-indicator'))).toBe(true);
    await act(async () => {
      gate.resolve();
      await settle();
    });
  });

  it('오류 알림은 접근 가능한 이름이 있다(aria-labelledby가 문구를 가리킨다)', async () => {
    await open({ source: imageFile({ corrupt: true }) });
    const dialog = id('error-dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('사진을 편집하지 못했어요');
  });

  it('자동 보정 강도 슬라이더는 aria-valuetext(퍼센트)를 가진다', async () => {
    await open();
    await click('tab-adjust');
    expect(id('adjust-auto-strength-slider')).toHaveAttribute('aria-valuetext', '0%');
    await click('adjust-auto-toggle');
    expect(id('adjust-auto-strength-slider')).toHaveAttribute('aria-valuetext', '100%');
  });
});
