import { useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type HostInstance,
  type LayoutChangeEvent,
  type NativeTouchEvent,
} from 'react-native';

import { colors } from '../../../shared/ui/theme';
import {
  clampPan,
  clampScale,
  panForFocalPoint,
  releasedScale,
  type Point,
  type Size,
} from '../photoZoom';

type Props = {
  uri: string;
  accessibilityLabel: string;
  /** 사진 위(오른쪽 아래)에 얹을 내용. 사인. 확대할 때 사진과 같이 움직인다. */
  children?: ReactNode;
};

type Gesture = {
  distance: number;
  /** 시작 때 두 손가락의 중점(컨테이너 좌표). */
  focal: Point;
  scale: number;
  pan: Point;
};

const midpoint = (a: NativeTouchEvent, b: NativeTouchEvent): Point => ({
  x: (a.pageX + b.pageX) / 2,
  y: (a.pageY + b.pageY) / 2,
});
const distance = (a: NativeTouchEvent, b: NativeTouchEvent): number =>
  Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

/**
 * 핀치로 1배~4배 확대하는 사진. 손을 떼면 1배로 돌아오고, 두 손가락 팬은 확대한 범위 안으로 제한된다.
 * 손가락 아래 지점이 고정되도록 확대 중심을 맞춘다(photoZoom의 순수 함수). 한 손가락 터치는 건드리지 않는다.
 * 제스처 라이브러리 없이 View의 터치 이벤트와 Animated(JS 구동)로 구현한다.
 */
export function ZoomablePhoto({ uri, accessibilityLabel, children }: Props) {
  const [scale] = useState(() => new Animated.Value(1));
  const [translateX] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(0));
  const container = useRef<Size>({ width: 0, height: 0 });
  const origin = useRef<Point>({ x: 0, y: 0 });
  const host = useRef<HostInstance>(null);
  const gesture = useRef<Gesture | null>(null);
  // 현재 변환(손가락을 움직이는 동안 계속 갱신).
  const current = useRef<{ scale: number; pan: Point }>({ scale: 1, pan: { x: 0, y: 0 } });

  const apply = (nextScale: number, pan: Point) => {
    current.current = { scale: nextScale, pan };
    scale.setValue(nextScale);
    translateX.setValue(pan.x);
    translateY.setValue(pan.y);
  };

  const onTouchStart = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    if (touches.length !== 2) return;
    // 터치 좌표는 화면 기준(pageX/Y)이라 컨테이너의 화면 위치를 한 번 재서 컨테이너 좌표로 바꾼다.
    host.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
    });
    const mid = midpoint(touches[0], touches[1]);
    gesture.current = {
      distance: distance(touches[0], touches[1]),
      focal: { x: mid.x - origin.current.x, y: mid.y - origin.current.y },
      scale: current.current.scale,
      pan: current.current.pan,
    };
  };

  const onTouchMove = (event: GestureResponderEvent) => {
    const start = gesture.current;
    const touches = event.nativeEvent.touches;
    if (!start || touches.length !== 2 || start.distance <= 0) return;
    const nextScale = clampScale((start.scale * distance(touches[0], touches[1])) / start.distance);
    const mid = midpoint(touches[0], touches[1]);
    const moved = {
      x: mid.x - origin.current.x - start.focal.x,
      y: mid.y - origin.current.y - start.focal.y,
    };
    const anchored = panForFocalPoint(
      start.focal,
      start.scale,
      nextScale,
      start.pan,
      container.current,
    );
    apply(
      nextScale,
      clampPan({ x: anchored.x + moved.x, y: anchored.y + moved.y }, nextScale, container.current),
    );
  };

  const onTouchEnd = (event: GestureResponderEvent) => {
    if (event.nativeEvent.touches.length >= 2 || gesture.current === null) return;
    gesture.current = null;
    // 손을 떼면 원래 크기로 돌아온다.
    current.current = { scale: releasedScale(current.current.scale), pan: { x: 0, y: 0 } };
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.timing(translateX, { toValue: 0, duration: 200, useNativeDriver: false }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();
  };

  const onLayout = (event: LayoutChangeEvent) => {
    container.current = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
  };

  return (
    <View
      ref={host}
      testID="feed.photo"
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={styles.root}
      onLayout={onLayout}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <Animated.View
        style={[styles.fill, { transform: [{ translateX }, { translateY }, { scale }] }]}
      >
        <Image source={{ uri }} style={styles.fill} resizeMode="contain" />
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: colors.surface },
  fill: { flex: 1 },
});
