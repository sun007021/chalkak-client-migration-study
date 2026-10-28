import { fireEvent, render, screen } from '@testing-library/react-native';

import { t } from '../../shared/copy';
import { ImageDecodeError } from './ImageErrors';
import { PhotoEditScreen } from './PhotoEditScreen';
import { createEditHarness, grayRamp, type EditHarness } from './__testing__/createEditHarness';

async function renderEditor(h: EditHarness = createEditHarness()) {
  await h.viewModel.start();
  await render(<PhotoEditScreen viewModel={h.viewModel} />);
  return h;
}

const RATIOS = [
  ['original', 'edit.ratio.original'],
  ['free', 'edit.ratio.free'],
  ['1-1', 'edit.ratio.1-1'],
  ['4-5', 'edit.ratio.4-5'],
  ['5-4', 'edit.ratio.5-4'],
  ['3-4', 'edit.ratio.3-4'],
  ['4-3', 'edit.ratio.4-3'],
  ['9-16', 'edit.ratio.9-16'],
  ['16-9', 'edit.ratio.16-9'],
] as const;

const ADJUST_ITEMS = [
  ['auto', 'edit.adjust.auto'],
  ['exposure', 'edit.adjust.exposure'],
  ['contrast', 'edit.adjust.contrast'],
  ['highlights', 'edit.adjust.highlights'],
  ['shadows', 'edit.adjust.shadows'],
  ['black-point', 'edit.adjust.black-point'],
  ['saturation', 'edit.adjust.saturation'],
  ['warmth', 'edit.adjust.warmth'],
] as const;

const FILTERS = [
  ['original', 'edit.filter.original'],
  ['mono', 'edit.filter.mono'],
  ['warm', 'edit.filter.warm'],
  ['cool', 'edit.filter.cool'],
  ['vintage', 'edit.filter.vintage'],
  ['vivid', 'edit.filter.vivid'],
] as const;

describe('PhotoEditScreen 공통 구성', () => {
  it('TC-EDIT-002 REQ-EDIT-001 상단 "취소/완료", 하단 "자르기/조정/필터" 탭, 미리보기가 보이고 처음에는 자르기 탭이 선택된다', async () => {
    await renderEditor();
    expect(screen.getByTestId('photo-edit.root')).toBeOnTheScreen();
    expect(screen.getByTestId('photo-edit.cancel-button')).toHaveTextContent(t('edit.top.cancel'));
    expect(screen.getByTestId('photo-edit.done-button')).toHaveTextContent(t('edit.top.done'));
    expect(screen.getByTestId('photo-edit.preview-image')).toBeOnTheScreen();
    expect(screen.getByTestId('photo-edit.tab-crop')).toHaveTextContent(t('edit.tab.crop'));
    expect(screen.getByTestId('photo-edit.tab-adjust')).toHaveTextContent(t('edit.tab.adjust'));
    expect(screen.getByTestId('photo-edit.tab-filter')).toHaveTextContent(t('edit.tab.filter'));
    expect(screen.getByTestId('photo-edit.tab-crop')).toBeSelected();
    expect(screen.getByTestId('photo-edit.tab-adjust')).not.toBeSelected();
    expect(screen.getByTestId('photo-edit.tab-filter')).not.toBeSelected();
  });

  it('TC-EDIT-002 자르기 탭에는 "90도 회전", "초기화", 자르기 영역이 있다', async () => {
    await renderEditor();
    expect(screen.getByTestId('photo-edit.crop-area')).toBeOnTheScreen();
    expect(screen.getByTestId('photo-edit.rotate-button')).toHaveTextContent(t('edit.crop.rotate'));
    expect(screen.getByTestId('photo-edit.reset-button')).toHaveTextContent(t('edit.crop.reset'));
  });

  it('TC-EDIT-002 탭을 누르면 해당 탭만 selected가 되고 그 탭의 도구가 보인다', async () => {
    await renderEditor();
    await fireEvent.press(screen.getByTestId('photo-edit.tab-filter'));
    expect(screen.getByTestId('photo-edit.tab-filter')).toBeSelected();
    expect(screen.getByTestId('photo-edit.tab-crop')).not.toBeSelected();
    expect(screen.getByTestId('photo-edit.filter-original')).toBeOnTheScreen();
    expect(screen.queryByTestId('photo-edit.rotate-button')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('photo-edit.tab-adjust'));
    expect(screen.getByTestId('photo-edit.tab-adjust')).toBeSelected();
    expect(screen.queryByTestId('photo-edit.filter-original')).not.toBeOnTheScreen();
  });

  it('"취소"와 "완료"가 ViewModel로 연결된다', async () => {
    const h = await renderEditor();
    await fireEvent.press(screen.getByTestId('photo-edit.done-button'));
    expect(h.done).toHaveLength(1);
    const h2 = await renderEditor(createEditHarness());
    await fireEvent.press(screen.getAllByTestId('photo-edit.cancel-button').at(-1)!);
    expect(h2.cancels).toHaveLength(1);
  });

  it('TC-EDIT-008 편집용 이미지 준비가 실패하면 편집기를 그대로 두고 오류 알림 "사진을 편집하지 못했어요. 다시 시도해 주세요."를 보인다', async () => {
    const h = createEditHarness();
    h.engine.failNext('prepareEditable', new ImageDecodeError());
    await renderEditor(h);
    expect(screen.getByTestId('photo-edit.root')).toBeOnTheScreen();
    expect(screen.getByTestId('photo-edit.error-dialog')).toHaveTextContent(t('edit.error.render'));
  });
});

describe('PhotoEditScreen 자르기 탭', () => {
  it('TC-EDIT-013 비율 버튼 9개가 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9 문구로 보이고 처음에는 "자유"가 selected다', async () => {
    await renderEditor();
    for (const [id, key] of RATIOS) {
      expect(screen.getByTestId(`photo-edit.ratio-${id}`)).toHaveTextContent(
        t(key as Parameters<typeof t>[0]),
      );
    }
    expect(screen.getByTestId('photo-edit.ratio-free')).toBeSelected();
    expect(screen.getByTestId('photo-edit.ratio-original')).not.toBeSelected();
  });

  it('TC-EDIT-013 비율 버튼을 누르면 selected가 옮겨지고 ViewModel의 비율이 바뀐다', async () => {
    const h = await renderEditor();
    await fireEvent.press(screen.getByTestId('photo-edit.ratio-4-5'));
    expect(screen.getByTestId('photo-edit.ratio-4-5')).toBeSelected();
    expect(screen.getByTestId('photo-edit.ratio-free')).not.toBeSelected();
    expect(h.viewModel.getSnapshot().aspect).toBe('4:5');
  });

  it('"90도 회전"과 자르기 "초기화" 버튼이 ViewModel로 연결된다', async () => {
    const h = await renderEditor();
    await fireEvent.press(screen.getByTestId('photo-edit.rotate-button'));
    expect(h.viewModel.getSnapshot().quarterTurns).toBe(1);
    await fireEvent.press(screen.getByTestId('photo-edit.reset-button'));
    expect(h.viewModel.getSnapshot().quarterTurns).toBe(0);
  });
});

describe('PhotoEditScreen 조정 탭', () => {
  async function renderAdjust() {
    const h = await renderEditor(createEditHarness({ sample: () => grayRamp(64, 4, 140, 200) }));
    await fireEvent.press(screen.getByTestId('photo-edit.tab-adjust'));
    return h;
  }

  it('REQ-EDIT-019 TC-EDIT-023 항목 줄은 자동, 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함 순서의 문구로 보인다', async () => {
    await renderAdjust();
    for (const [id, key] of ADJUST_ITEMS) {
      expect(screen.getByTestId(`photo-edit.adjust-item-${id}`)).toHaveTextContent(
        t(key as Parameters<typeof t>[0]),
      );
    }
    expect(screen.getByTestId('photo-edit.adjust-item-auto')).toBeSelected();
    expect(screen.getByTestId('photo-edit.adjust-reset-button')).toHaveTextContent(
      t('edit.adjust.reset'),
    );
  });

  it('TC-EDIT-023 항목을 고르면 그 항목의 눈금자가 보이고 표시값은 100배한 정수(-100~100)다', async () => {
    const h = await renderAdjust();
    await fireEvent.press(screen.getByTestId('photo-edit.adjust-item-exposure'));
    expect(screen.getByTestId('photo-edit.adjust-item-exposure')).toBeSelected();
    const slider = screen.getByTestId('photo-edit.adjust-exposure-slider');
    expect(slider).toHaveAccessibilityValue({ now: 0 });
    await fireEvent(slider, 'valueChange', 0.5);
    expect(h.viewModel.getSnapshot().adjustValues.exposure).toBeCloseTo(0.5);
    expect(screen.getByTestId('photo-edit.adjust-exposure-slider')).toHaveAccessibilityValue({
      now: 50,
    });
    await fireEvent(screen.getByTestId('photo-edit.adjust-exposure-slider'), 'valueChange', -1.4);
    expect(screen.getByTestId('photo-edit.adjust-exposure-slider')).toHaveAccessibilityValue({
      now: -100,
    });
  });

  it('REQ-EDIT-021 "자동" 항목에는 토글(checked)과 강도 눈금자(0~1)가 있고 토글을 누르면 켜짐·꺼짐이 바뀐다', async () => {
    const h = await renderAdjust();
    const toggle = screen.getByTestId('photo-edit.adjust-auto-toggle');
    expect(toggle).not.toBeChecked();
    await fireEvent.press(toggle);
    expect(screen.getByTestId('photo-edit.adjust-auto-toggle')).toBeChecked();
    expect(h.viewModel.getSnapshot().adjustments.autoStrength).toBe(1);
    await fireEvent(
      screen.getByTestId('photo-edit.adjust-auto-strength-slider'),
      'valueChange',
      0.5,
    );
    expect(h.viewModel.getSnapshot().adjustments.autoStrength).toBe(0.5);
    await fireEvent.press(screen.getByTestId('photo-edit.adjust-auto-toggle'));
    expect(screen.getByTestId('photo-edit.adjust-auto-toggle')).not.toBeChecked();
  });

  it('REQ-EDIT-024 조정 "초기화" 버튼이 ViewModel로 연결된다', async () => {
    const h = await renderAdjust();
    h.viewModel.setAdjustValue('warmth', 0.4);
    await fireEvent.press(screen.getByTestId('photo-edit.adjust-reset-button'));
    expect(h.viewModel.getSnapshot().adjustments.user).toEqual({});
  });
});

describe('PhotoEditScreen 필터 탭', () => {
  it('TC-EDIT-039 필터 6종이 원본, 흑백, 따뜻하게, 차갑게, 빈티지, 선명하게 문구로 보이고 처음에는 "원본"이 selected다', async () => {
    await renderEditor();
    await fireEvent.press(screen.getByTestId('photo-edit.tab-filter'));
    for (const [id, key] of FILTERS) {
      expect(screen.getByTestId(`photo-edit.filter-${id}`)).toHaveTextContent(
        t(key as Parameters<typeof t>[0]),
      );
    }
    expect(screen.getByTestId('photo-edit.filter-original')).toBeSelected();
  });

  it('TC-EDIT-039 필터를 누르면 selected가 옮겨지고 ViewModel의 필터가 바뀐다', async () => {
    const h = await renderEditor();
    await fireEvent.press(screen.getByTestId('photo-edit.tab-filter'));
    await fireEvent.press(screen.getByTestId('photo-edit.filter-vintage'));
    expect(screen.getByTestId('photo-edit.filter-vintage')).toBeSelected();
    expect(screen.getByTestId('photo-edit.filter-original')).not.toBeSelected();
    expect(h.viewModel.getSnapshot().filter).toBe('vintage');
  });
});
