import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { t } from '../../../copy/ko';
import { editorFakes, renderEditor, settle } from '../../../test/editorHarness';
import { imageFile } from '../../../test/FakeImageDecoder';
import { IDENTITY_EDIT, NO_AUTO_VALUES } from '../editModel';
import type { PhotoEdit } from '../editModel';
import { FILTER_THUMBNAIL_LONG_EDGE } from './PhotoEditorViewModel';

const id = (name: string) => screen.getByTestId(`photo-edit.${name}`);
const maybe = (name: string) => screen.queryByTestId(`photo-edit.${name}`);
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(id(name));
  });
  await act(async () => settle());
};
const slider = (name: string) => id(name) as HTMLInputElement;

async function open(options: Parameters<typeof renderEditor>[0] = {}) {
  const view = renderEditor(options);
  await act(async () => settle());
  return view;
}

const TOOL_LABEL = { crop: t('edit.tab.crop'), adjust: t('edit.tab.adjust'), filter: t('edit.tab.filter') };

describe('편집기 화면: 구성과 접근성 (REQ-EDIT-001)', () => {
  it('TC-EDIT-002 상단 "취소/완료", 하단 탭 "자르기/조정/필터", 미리보기, 자르기 도구(90도 회전·초기화)가 보이고 testids.md 식별자가 있다', async () => {
    await open();
    expect(id('root')).toBeInTheDocument();
    expect(id('cancel-button')).toHaveTextContent(t('edit.top.cancel'));
    expect(id('done-button')).toHaveTextContent(t('edit.top.done'));
    expect(id('tab-crop')).toHaveTextContent(TOOL_LABEL.crop);
    expect(id('tab-adjust')).toHaveTextContent(TOOL_LABEL.adjust);
    expect(id('tab-filter')).toHaveTextContent(TOOL_LABEL.filter);
    expect(id('preview-image')).toBeInTheDocument();
    expect(id('crop-area')).toBeInTheDocument();
    expect(id('rotate-button')).toHaveTextContent(t('edit.crop.rotate'));
    expect(id('reset-button')).toHaveTextContent(t('edit.crop.reset'));
  });

  it('REQ-EDIT-001 처음에는 "자르기" 탭이 선택되어 있다(aria-selected)', async () => {
    await open();
    expect(id('tab-crop')).toHaveAttribute('aria-selected', 'true');
    expect(id('tab-adjust')).toHaveAttribute('aria-selected', 'false');
    expect(id('tab-filter')).toHaveAttribute('aria-selected', 'false');
    expect(id('tab-crop')).toHaveAttribute('role', 'tab');
  });

  it('업로드 화면 위 모달이다: role=dialog aria-modal이고 포커스가 안으로 들어오며 Esc는 취소다', async () => {
    const { cancels } = await open();
    const root = id('root');
    expect(root).toHaveAttribute('role', 'dialog');
    expect(root).toHaveAttribute('aria-modal', 'true');
    expect(root.contains(document.activeElement)).toBe(true);
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(cancels.count).toBe(1);
  });

  it('모달 안에서 Tab은 가장자리에서 돌아온다(포커스가 편집기 밖으로 나가지 않는다)', async () => {
    await open();
    const root = id('root');
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    const last = focusables[focusables.length - 1]!;
    last.focus();
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Tab' });
    });
    expect(root.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
  });

  it('닫히면(언마운트) 열기 전에 포커스가 있던 요소로 돌아간다', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = await open();
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('"취소"와 "완료" 버튼은 각각 취소·확정을 부른다', async () => {
    const view = await open();
    await click('done-button');
    expect(view.confirmed).toHaveLength(1);
    expect(view.cancels.count).toBe(0);
    view.unmount();
    const second = await open();
    await click('cancel-button');
    expect(second.cancels.count).toBe(1);
    expect(second.confirmed).toHaveLength(0);
  });

  it('사진을 읽는 동안에는 "완료"가 비활성이고 읽으면 활성이다', async () => {
    const fakes = editorFakes();
    const source = imageFile();
    const gate = fakes.decoder.hold(source);
    renderEditor({ fakes, source });
    await act(async () => settle());
    expect(id('done-button')).toBeDisabled();
    expect(maybe('preview-image')).not.toBeInTheDocument();
    gate.resolve();
    await act(async () => settle());
    expect(id('done-button')).toBeEnabled();
    expect(id('preview-image')).toHaveAttribute('src', expect.stringMatching(/^preview:/));
  });

  it('StrictMode 이중 마운트에서도 살아 있는 디코드 이미지는 하나이고 미리보기가 그려진다', async () => {
    const { fakes } = await open({ strict: true });
    expect(fakes.decoder.images.filter((i) => !i.released)).toHaveLength(1);
    expect(id('preview-image')).toBeInTheDocument();
  });

  it('언마운트하면 디코드한 이미지와 미리보기를 놓는다', async () => {
    const { fakes, unmount } = await open();
    unmount();
    // 소유 ViewModel의 dispose는 한 틱 미뤄진다(StrictMode의 가짜 언마운트에서 인스턴스를 유지하려고).
    await waitFor(() => expect(fakes.decoder.images.every((i) => i.released)).toBe(true));
    expect(fakes.preview.frames.every((f) => f.released)).toBe(true);
  });
});

describe('편집기 화면: 자르기 도구 (REQ-EDIT-010~016)', () => {
  const RATIOS = ['original', 'free', '1-1', '4-5', '5-4', '3-4', '4-3', '9-16', '16-9'] as const;
  const RATIO_LABELS = ['원본', '자유', '1:1', '4:5', '5:4', '3:4', '4:3', '9:16', '16:9'];

  it('TC-EDIT-013 비율 버튼 9개가 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9 순서이고 처음은 "자유"가 선택되어 있다', async () => {
    await open();
    const buttons = RATIOS.map((r) => id(`ratio-${r}`));
    expect(buttons.map((b) => b.textContent)).toEqual(RATIO_LABELS);
    expect(RATIO_LABELS).toEqual(RATIOS.map((r) => t(`edit.ratio.${r}` as 'edit.ratio.free')));
    // DOM 순서
    const order = buttons.map((b) => b.compareDocumentPosition(buttons[buttons.length - 1]!));
    expect(order.slice(0, -1).every((p) => (p & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)).toBe(true);
    expect(buttons.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false', 'false', 'false', 'false']);
    expect(buttons[0]).toHaveAttribute('role', 'radio');
  });

  it('TC-EDIT-014 비율을 고르면 선택 표시가 옮겨 가고 프레임이 그 비율로 가장 크게 바뀐다(4000×3000에서 1:1 → 폭 0.75, 높이 1)', async () => {
    await open();
    await click('ratio-1-1');
    expect(id('ratio-1-1')).toHaveAttribute('aria-checked', 'true');
    expect(id('ratio-free')).toHaveAttribute('aria-checked', 'false');
    const area = id('crop-area');
    expect(area.dataset.width).toBe('0.7500');
    expect(area.dataset.height).toBe('1.0000');
    expect(area.dataset.centerX).toBe('0.5000');
    expect(area.dataset.centerY).toBe('0.5000');
  });

  it('REQ-EDIT-013 자르기 프레임에는 모서리 손잡이 4개, 이동 영역, 3×3 격자선이 있다', async () => {
    await open();
    const area = id('crop-area');
    for (const handle of ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'move']) {
      expect(area.querySelector(`[data-handle="${handle}"]`), handle).not.toBeNull();
    }
    expect(area.querySelectorAll('[data-grid-line]')).toHaveLength(4);
  });

  it('TC-EDIT-018 모서리 손잡이를 끌면 프레임 값이 따라간다(포인터 드래그 → 순수 계산 → 반영)', async () => {
    await open();
    const area = id('crop-area');
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 400, bottom: 300, x: 0, y: 0, width: 400, height: 300, toJSON: () => ({}) });
    const handle = area.querySelector('[data-handle="bottom-right"]')!;
    fireEvent.pointerDown(handle, { clientX: 400, clientY: 300, pointerId: 1, buttons: 1, isPrimary: true });
    fireEvent.pointerMove(handle, { clientX: 300, clientY: 225, pointerId: 1, buttons: 1, isPrimary: true });
    // 반대쪽 모서리(왼쪽 위)가 고정되고 오른쪽 아래가 (-0.25, -0.25)만큼 이동: 폭·높이 0.75
    expect(area.dataset.width).toBe('0.7500');
    expect(area.dataset.height).toBe('0.7500');
    expect(area.dataset.centerX).toBe('0.3750');
    expect(area.dataset.centerY).toBe('0.3750');
    fireEvent.pointerUp(handle, { clientX: 300, clientY: 225, pointerId: 1, buttons: 0, isPrimary: true });
    // 끌기가 끝난 뒤 움직임은 무시
    fireEvent.pointerMove(handle, { clientX: 100, clientY: 100, pointerId: 1, buttons: 0, isPrimary: true });
    expect(area.dataset.width).toBe('0.7500');
  });

  it('TC-EDIT-018 이동 영역을 끌어도 사진 밖으로 나가지 않는다', async () => {
    await open();
    await click('ratio-1-1');
    const area = id('crop-area');
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 400, bottom: 300, x: 0, y: 0, width: 400, height: 300, toJSON: () => ({}) });
    const move = area.querySelector('[data-handle="move"]')!;
    fireEvent.pointerDown(move, { clientX: 200, clientY: 150, pointerId: 2, buttons: 1, isPrimary: true });
    fireEvent.pointerMove(move, { clientX: 900, clientY: 150, pointerId: 2, buttons: 1, isPrimary: true });
    fireEvent.pointerUp(move, { clientX: 900, clientY: 150, pointerId: 2, buttons: 0, isPrimary: true });
    expect(area.dataset.centerX).toBe('0.6250'); // 폭 0.75 → 오른쪽 끝에 닿는다
    expect(area.dataset.width).toBe('0.7500');
  });

  it('TC-EDIT-015 "90도 회전"을 누르면 새 회전으로 미리보기를 다시 그린다', async () => {
    const { fakes } = await open();
    await click('rotate-button');
    expect(fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-1)!.edit.quarterTurns).toBe(1);
  });

  it('REQ-EDIT-016 자르기 "초기화"는 회전·프레임·비율을 되돌린다', async () => {
    await open();
    await click('rotate-button');
    await click('ratio-4-5');
    await click('reset-button');
    expect(id('ratio-free')).toHaveAttribute('aria-checked', 'true');
    expect(id('crop-area').dataset.width).toBe('1.0000');
    expect(id('crop-area').dataset.height).toBe('1.0000');
  });

  it('REQ-EDIT-017 TC-EDIT-021 수평 보정(straighten) 조작은 화면에 없다', async () => {
    await open();
    expect(screen.queryByText(/수평/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid*="straighten"]')).toBeNull();
  });

  it('조정·필터 탭에서는 자르기 프레임과 비율 버튼이 없다', async () => {
    await open();
    await click('tab-adjust');
    expect(maybe('crop-area')).not.toBeInTheDocument();
    expect(maybe('ratio-free')).not.toBeInTheDocument();
    expect(maybe('rotate-button')).not.toBeInTheDocument();
  });
});

describe('편집기 화면: 조정 도구 (REQ-EDIT-019~024)', () => {
  const ITEMS = ['auto', 'exposure', 'contrast', 'highlights', 'shadows', 'black-point', 'saturation', 'warmth'] as const;
  const ITEM_COPY = ['auto', 'exposure', 'contrast', 'highlights', 'shadows', 'black-point', 'saturation', 'warmth'] as const;

  it('TC-EDIT-023 항목 줄은 자동, 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함 순서이고 처음은 "자동"이 선택되어 있다', async () => {
    await open();
    await click('tab-adjust');
    expect(id('tab-adjust')).toHaveAttribute('aria-selected', 'true');
    const items = ITEMS.map((item) => id(`adjust-item-${item}`));
    expect(items.map((b) => b.textContent)).toEqual(ITEM_COPY.map((key) => t(`edit.adjust.${key}` as 'edit.adjust.auto')));
    expect(items.map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false', 'false', 'false']);
  });

  it('REQ-EDIT-020 "자동" 항목에는 꺼진 토글과 강도 슬라이더(0~1)가 있고 직접 슬라이더는 없다', async () => {
    await open();
    await click('tab-adjust');
    expect(id('adjust-auto-toggle')).toHaveAttribute('aria-checked', 'false');
    const strength = slider('adjust-auto-strength-slider');
    expect(strength.type).toBe('range');
    expect([strength.min, strength.max]).toEqual(['0', '1']);
    expect(strength.value).toBe('0');
    expect(maybe('adjust-exposure-slider')).not.toBeInTheDocument();
  });

  it('REQ-EDIT-021 TC-EDIT-032 자동 토글을 켜면 강도가 1이 되고 다시 누르면 꺼진다', async () => {
    await open();
    await click('tab-adjust');
    await click('adjust-auto-toggle');
    expect(id('adjust-auto-toggle')).toHaveAttribute('aria-checked', 'true');
    expect(slider('adjust-auto-strength-slider').value).toBe('1');
    await click('adjust-auto-toggle');
    expect(id('adjust-auto-toggle')).toHaveAttribute('aria-checked', 'false');
  });

  it('REQ-EDIT-021 항목 줄에서 이미 선택된 "자동"을 다시 누르면 켜짐/꺼짐이 번갈아 바뀐다', async () => {
    await open();
    await click('tab-adjust');
    await click('adjust-item-auto');
    expect(id('adjust-auto-toggle')).toHaveAttribute('aria-checked', 'true');
    await click('adjust-item-auto');
    expect(id('adjust-auto-toggle')).toHaveAttribute('aria-checked', 'false');
  });

  it('TC-EDIT-023 항목을 고르면 그 항목의 슬라이더 하나만 보이고 범위는 표시값 -100~100(step 1)이다', async () => {
    await open();
    await click('tab-adjust');
    await click('adjust-item-exposure');
    expect(id('adjust-item-exposure')).toHaveAttribute('aria-selected', 'true');
    expect(id('adjust-item-auto')).toHaveAttribute('aria-selected', 'false');
    const s = slider('adjust-exposure-slider');
    expect(s.type).toBe('range');
    expect([s.min, s.max, s.step, s.value]).toEqual(['-100', '100', '1', '0']);
    expect(s).toHaveAttribute('aria-label', t('edit.adjust.exposure'));
    expect(s).toHaveAttribute('aria-valuetext', '0');
    expect(maybe('adjust-contrast-slider')).not.toBeInTheDocument();
    await click('adjust-item-black-point');
    expect(maybe('adjust-exposure-slider')).not.toBeInTheDocument();
    expect(slider('adjust-black-point-slider').value).toBe('0');
  });

  it('슬라이더를 움직이면 값 표시(aria-valuetext)와 미리보기 편집값이 바뀐다', async () => {
    const { fakes } = await open();
    await click('tab-adjust');
    await click('adjust-item-saturation');
    await act(async () => {
      fireEvent.change(slider('adjust-saturation-slider'), { target: { value: '30' } });
    });
    await act(async () => settle());
    const s = slider('adjust-saturation-slider');
    expect(s.value).toBe('30');
    expect(s).toHaveAttribute('aria-valuetext', '30');
    expect(fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-1)!.edit.adjustmentLayers.manual.saturation).toBeCloseTo(0.3, 12);
  });

  it('키보드로 조작한다: ←/→는 1, PageUp/PageDown은 10, Home/End는 -100/100 (범위를 넘지 않음)', async () => {
    await open();
    await click('tab-adjust');
    await click('adjust-item-warmth');
    const s = slider('adjust-warmth-slider');
    const press = async (key: string) => {
      await act(async () => {
        fireEvent.keyDown(s, { key });
      });
    };
    await press('ArrowRight');
    expect(s.value).toBe('1');
    await press('ArrowUp');
    expect(s.value).toBe('2');
    await press('PageUp');
    expect(s.value).toBe('12');
    await press('ArrowLeft');
    await press('ArrowDown');
    expect(s.value).toBe('10');
    await press('PageDown');
    await press('PageDown');
    expect(s.value).toBe('-10');
    await press('End');
    expect(s.value).toBe('100');
    await press('ArrowRight');
    expect(s.value).toBe('100');
    await press('Home');
    expect(s.value).toBe('-100');
    await press('PageDown');
    expect(s.value).toBe('-100');
  });

  it('TC-EDIT-032 자동 보정을 켜면 항목 슬라이더가 분석값 × 강도(노출 0.4 → 40)를 보여 준다', async () => {
    await open();
    await click('tab-adjust');
    await click('adjust-auto-toggle');
    await click('adjust-item-exposure');
    expect(slider('adjust-exposure-slider').value).toBe('40');
    await click('adjust-item-contrast');
    expect(slider('adjust-contrast-slider').value).toBe('20');
    await click('adjust-item-shadows');
    expect(slider('adjust-shadows-slider').value).toBe('0');
  });

  it('REQ-EDIT-024 조정 "초기화"는 직접 값과 자동 강도를 지운다', async () => {
    await open();
    await click('tab-adjust');
    await click('adjust-item-contrast');
    await act(async () => {
      fireEvent.change(slider('adjust-contrast-slider'), { target: { value: '55' } });
    });
    await click('adjust-reset-button');
    expect(id('adjust-reset-button')).toHaveTextContent(t('edit.adjust.reset'));
    expect(slider('adjust-contrast-slider').value).toBe('0');
    await click('adjust-item-auto');
    // "초기화" 뒤 "자동" 항목을 처음 누르는 것이므로 켜진다
    expect(id('adjust-auto-toggle')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('편집기 화면: 필터 도구 (REQ-EDIT-028, 029)', () => {
  const FILTERS = ['original', 'mono', 'warm', 'cool', 'vintage', 'vivid'] as const;

  it('TC-EDIT-039 필터 6종이 원본, 흑백, 따뜻하게, 차갑게, 빈티지, 선명하게 순서로 썸네일과 함께 보이고 처음은 "원본"이다', async () => {
    await open();
    await click('tab-filter');
    expect(id('tab-filter')).toHaveAttribute('aria-selected', 'true');
    const buttons = FILTERS.map((f) => id(`filter-${f}`));
    expect(buttons.map((b) => b.textContent)).toEqual(FILTERS.map((f) => t(`edit.filter.${f}` as 'edit.filter.original')));
    expect(buttons.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
    for (const b of buttons) expect(b.querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^preview:/));
  });

  it('필터를 고르면 선택 표시가 옮겨 가고 그 필터로 미리보기를 다시 그린다', async () => {
    const { fakes } = await open();
    await click('tab-filter');
    await click('filter-warm');
    expect(id('filter-warm')).toHaveAttribute('aria-checked', 'true');
    expect(id('filter-original')).toHaveAttribute('aria-checked', 'false');
    expect(fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-1)!.edit.filter).toBe('warm');
  });

  it('다시 열면 이전에 고른 필터가 선택되어 있다 (TC-EDIT-006 복원)', async () => {
    const initialEdit: PhotoEdit = { ...IDENTITY_EDIT, filter: 'vintage' };
    await open({ initialEdit });
    await click('tab-filter');
    expect(id('filter-vintage')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('편집기 화면: 완료 중 표시와 오류 (REQ-EDIT-006)', () => {
  it('TC-EDIT-007 완료를 누른 뒤 마지막 렌더를 기다리는 동안 진행 표시가 보이고 버튼이 잠긴다', async () => {
    const { fakes, confirmed } = await open();
    await click('tab-filter');
    const gate = fakes.preview.hold();
    await click('filter-cool');
    expect(maybe('rendering-indicator')).not.toBeInTheDocument();
    await click('done-button');
    expect(id('rendering-indicator')).toBeInTheDocument();
    expect(id('done-button')).toBeDisabled();
    expect(confirmed).toHaveLength(0);
    await act(async () => {
      gate.resolve();
      await settle();
    });
    expect(maybe('rendering-indicator')).not.toBeInTheDocument();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.filter).toBe('cool');
  });

  it('TC-EDIT-008 렌더링 실패 시 닫지 않고 "사진을 편집하지 못했어요. 다시 시도해 주세요."를 보여 주며 다시 시도할 수 있다', async () => {
    const { fakes, confirmed, cancels } = await open();
    await click('tab-filter');
    fakes.preview.failWhen = (call) => call.maxLongEdge > FILTER_THUMBNAIL_LONG_EDGE;
    await click('filter-vivid');
    await click('done-button');
    const dialog = id('error-dialog');
    expect(dialog).toHaveAttribute('role', 'alertdialog');
    expect(dialog).toHaveTextContent('사진을 편집하지 못했어요. 다시 시도해 주세요.');
    expect(dialog).toHaveTextContent(t('edit.error.render'));
    expect(id('root')).toBeInTheDocument();
    expect(confirmed).toHaveLength(0);
    expect(cancels.count).toBe(0);
    fakes.preview.failWhen = null;
    await click('error-retry-button');
    expect(maybe('error-dialog')).not.toBeInTheDocument();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.filter).toBe('vivid');
  });

  it('TC-EDIT-008 읽을 수 없는 사진이면 열자마자 오류 알림을 보이고 "다시 시도"가 있다', async () => {
    await open({ photo: { corrupt: true } });
    expect(id('error-dialog')).toHaveTextContent(t('edit.error.render'));
    expect(id('error-retry-button')).toBeInTheDocument();
    expect(id('done-button')).toBeDisabled();
  });

  it('오류 알림이 열리면 포커스가 "다시 시도" 버튼으로 간다', async () => {
    await open({ photo: { corrupt: true } });
    expect(document.activeElement).toBe(id('error-retry-button'));
  });
});

describe('편집기 화면: 편집값 전달 (REQ-EDIT-002)', () => {
  it('TC-EDIT-003 화면에서 고른 필터·조정이 완료 시 편집값으로 전달된다', async () => {
    const { confirmed } = await open();
    await click('tab-filter');
    await click('filter-mono');
    await click('tab-adjust');
    await click('adjust-item-exposure');
    await act(async () => {
      fireEvent.change(slider('adjust-exposure-slider'), { target: { value: '25' } });
    });
    await click('done-button');
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.filter).toBe('mono');
    expect(confirmed[0]!.adjustmentLayers.manual.exposure).toBeCloseTo(0.25, 12);
    expect(confirmed[0]!.adjustmentLayers.autoValues).toEqual(NO_AUTO_VALUES);
  });
});
