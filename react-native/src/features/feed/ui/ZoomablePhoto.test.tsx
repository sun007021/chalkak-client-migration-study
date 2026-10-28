import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';

import { ZoomablePhoto } from './ZoomablePhoto';

const touches = (...points: [number, number][]) => ({
  nativeEvent: { touches: points.map(([pageX, pageY]) => ({ pageX, pageY })) },
});
const pinchAt = (half: number) => touches([200 - half, 300], [200 + half, 300]);

async function setup() {
  const view = await render(
    <ZoomablePhoto uri="https://x.test/p.webp" accessibilityLabel="사진" />,
  );
  await fireEvent(screen.getByTestId('feed.photo'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } },
  });
  return view;
}

const scaleOf = (): number => {
  const style = StyleSheet.flatten(screen.getByTestId('feed.photo-content').props.style);
  const entry = (style.transform as Record<string, number>[]).find((t) => 'scale' in t);
  return entry?.scale ?? NaN;
};

const touch = (
  name: 'touchStart' | 'touchMove' | 'touchEnd',
  payload: ReturnType<typeof touches>,
) =>
  act(async () => {
    await fireEvent(screen.getByTestId('feed.photo'), name, payload);
  });

describe('ZoomablePhoto', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('TC-FEED-046 핀치로 확대하고 손을 떼면 1배로 돌아온다', async () => {
    await setup();
    await touch('touchStart', pinchAt(50));
    await touch('touchMove', pinchAt(100));
    expect(scaleOf()).toBeCloseTo(2);
    await touch('touchEnd', touches());
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(scaleOf()).toBeCloseTo(1);
  });

  it('돌아오는 애니메이션 도중 다시 핀치하면 화면에 보이던 중간 배율에서 이어진다', async () => {
    await setup();
    await touch('touchStart', pinchAt(50));
    await touch('touchMove', pinchAt(100));
    await touch('touchEnd', touches());
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    const midway = scaleOf();
    expect(midway).toBeGreaterThan(1);
    expect(midway).toBeLessThan(2);

    await touch('touchStart', pinchAt(50));
    await touch('touchMove', pinchAt(50));
    expect(scaleOf()).toBeCloseTo(midway, 1);
  });

  it('사라질 때 돌아오는 애니메이션을 멈춘다', async () => {
    const stops: jest.SpyInstance[] = [];
    const parallel = Animated.parallel;
    jest.spyOn(Animated, 'parallel').mockImplementation((animations, config) => {
      const animation = parallel(animations, config);
      stops.push(jest.spyOn(animation, 'stop'));
      return animation;
    });
    const view = await setup();
    await touch('touchStart', pinchAt(50));
    await touch('touchMove', pinchAt(100));
    await touch('touchEnd', touches());
    expect(stops).toHaveLength(1);
    expect(stops[0]).not.toHaveBeenCalled();
    await view.unmount();
    expect(stops[0]).toHaveBeenCalled();
  });
});
