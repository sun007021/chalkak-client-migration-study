import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type HostInstance,
  type LayoutChangeEvent,
} from 'react-native';

import { colors } from '../../../shared/ui/theme';
import { PinchTracker, type Transform } from '../pinchTracker';

type Props = {
  uri: string;
  accessibilityLabel: string;
  /** 사진 위(오른쪽 아래)에 얹을 내용. 사인. 확대할 때 사진과 같이 움직인다. */
  children?: ReactNode;
};

const RETURN_MS = 200;

/**
 * 핀치로 1배~4배 확대하는 사진. 손을 떼면 1배로 돌아오고, 두 손가락 팬은 확대한 범위 안으로 제한된다.
 * 손가락 아래 지점이 고정되도록 확대 중심을 맞춘다(계산은 PinchTracker). 한 손가락 터치는 건드리지 않는다.
 * 제스처 라이브러리 없이 View의 터치 이벤트와 Animated(JS 구동)로 구현한다.
 */
export function ZoomablePhoto({ uri, accessibilityLabel, children }: Props) {
  const [scale] = useState(() => new Animated.Value(1));
  const [translateX] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(0));
  const [tracker] = useState(() => new PinchTracker());
  const host = useRef<HostInstance>(null);
  const returning = useRef<Animated.CompositeAnimation | null>(null);

  // 사라질 때 돌아오는 애니메이션이 남아 있지 않게 멈춘다.
  useEffect(
    () => () => {
      returning.current?.stop();
      returning.current = null;
    },
    [],
  );

  // 터치 좌표는 화면 기준이라 컨테이너의 화면 위치를 재서 컨테이너 좌표로 바꾼다. 측정은 비동기라
  // 레이아웃 때 미리 재 두고, 터치 시작 때 한 번 더 재서 스크롤 등으로 달라진 위치를 맞춘다.
  const measureOrigin = () => {
    host.current?.measureInWindow((x, y) => tracker.originMeasured({ x, y }));
  };

  /** 지금 화면에 보이는 변환. 돌아오는 애니메이션 중이면 중간 값이고, 그 애니메이션은 여기서 멈춘다. */
  const stopAndReadDisplayed = (): Transform => {
    returning.current?.stop();
    returning.current = null;
    let displayed: Transform = { scale: 1, pan: { x: 0, y: 0 } };
    scale.stopAnimation((value) => (displayed = { ...displayed, scale: value }));
    translateX.stopAnimation(
      (value) => (displayed = { ...displayed, pan: { ...displayed.pan, x: value } }),
    );
    translateY.stopAnimation(
      (value) => (displayed = { ...displayed, pan: { ...displayed.pan, y: value } }),
    );
    return displayed;
  };

  const onTouchStart = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    if (touches.length !== 2) return;
    measureOrigin();
    tracker.start(touches[0], touches[1], stopAndReadDisplayed());
  };

  const onTouchMove = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    if (touches.length !== 2) return;
    const next = tracker.move(touches[0], touches[1]);
    if (!next) return;
    scale.setValue(next.scale);
    translateX.setValue(next.pan.x);
    translateY.setValue(next.pan.y);
  };

  const onTouchEnd = (event: GestureResponderEvent) => {
    if (event.nativeEvent.touches.length >= 2 || !tracker.active) return;
    tracker.end();
    // 손을 떼면 원래 크기로 돌아온다.
    const animation = Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: RETURN_MS, useNativeDriver: false }),
      Animated.timing(translateX, { toValue: 0, duration: RETURN_MS, useNativeDriver: false }),
      Animated.timing(translateY, { toValue: 0, duration: RETURN_MS, useNativeDriver: false }),
    ]);
    returning.current = animation;
    animation.start(() => {
      if (returning.current === animation) returning.current = null;
    });
  };

  const onLayout = (event: LayoutChangeEvent) => {
    tracker.setContainer({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
    measureOrigin();
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
        testID="feed.photo-content"
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
