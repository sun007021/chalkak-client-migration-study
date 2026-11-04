import { render, screen } from '@testing-library/react-native';

import { BackButton } from '../ui/BackButton';
import { BottomSheet } from '../ui/BottomSheet';
import { GlassOverride, computeUsesGlass } from './glass';

describe('computeUsesGlass', () => {
  it('iOS 26 이상이고 투명도 줄이기가 꺼져 있을 때만 true다', () => {
    expect(computeUsesGlass({ os: 'ios', version: '26.0', reduceTransparency: false })).toBe(true);
    expect(computeUsesGlass({ os: 'ios', version: '27.1', reduceTransparency: false })).toBe(true);
    expect(computeUsesGlass({ os: 'ios', version: '25.4', reduceTransparency: false })).toBe(false);
    expect(computeUsesGlass({ os: 'ios', version: '26.0', reduceTransparency: true })).toBe(false);
    expect(computeUsesGlass({ os: 'android', version: 36, reduceTransparency: false })).toBe(false);
  });
});

describe('유리 재질 렌더', () => {
  const back = <BackButton testID="back" onPress={() => undefined} />;

  it('유리면 원형 내비 버튼이 블러 재질(44)로 그려진다', async () => {
    await render(<GlassOverride value>{back}</GlassOverride>);
    expect(screen.getByTestId('back.glass')).toBeOnTheScreen();
    expect(screen.getByTestId('mock-blur-view')).toBeOnTheScreen();
  });

  it('평면이면 블러 없이 아이콘만 그려진다', async () => {
    await render(<GlassOverride value={false}>{back}</GlassOverride>);
    expect(screen.queryByTestId('back.glass')).toBeNull();
    expect(screen.queryByTestId('mock-blur-view')).toBeNull();
    expect(screen.getByTestId('back')).toBeOnTheScreen();
  });

  it('유리면 바텀시트 배경에 블러가 깔리고 평면이면 없다', async () => {
    const sheet = (
      <BottomSheet testID="sheet" onRequestClose={() => undefined}>
        {null}
      </BottomSheet>
    );
    const { unmount } = await render(<GlassOverride value>{sheet}</GlassOverride>);
    expect(screen.getByTestId('sheet.glass')).toBeOnTheScreen();
    await unmount();
    await render(<GlassOverride value={false}>{sheet}</GlassOverride>);
    expect(screen.queryByTestId('sheet.glass')).toBeNull();
  });
});
