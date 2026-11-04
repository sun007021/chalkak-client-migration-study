import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../design/tokens';
import { GlassSurface, glassFill, useUsesGlass } from '../glass/glass';

// 원본 근거: docs/design/README.md §4 (시트: 원본과 같은 라운드 시트), screens-b.md §1.2.
// 위 모서리 28, surfaceElevated, 손잡이 32x4(screens-a.md §7.5 Android AiReviewSheetDragHandle).
const SLIDE_MS = 260;
const HANDLE_WIDTH = 32;
const HANDLE_HEIGHT = 4;

export type BottomSheetProps = {
  children: ReactNode;
  onRequestClose: () => void;
  testID?: string;
  /** 시트 높이를 고정한다(원본 피커 340, AI 시작 320). 생략하면 내용 높이, 최대 화면의 90%. */
  height?: number;
  /** 바깥(스크림) 탭으로 닫기. 기본 true. */
  dismissOnScrim?: boolean;
  showHandle?: boolean;
};

export function BottomSheet({
  children,
  onRequestClose,
  testID,
  height,
  dismissOnScrim = true,
  showHandle = true,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const glass = useUsesGlass();
  const { height: windowHeight } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] });

  return (
    <Modal
      transparent
      animationType="none"
      visible
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <Animated.View style={[styles.scrim, { opacity: progress }]}>
        <Pressable
          accessibilityLabel="닫기"
          style={StyleSheet.absoluteFill}
          onPress={dismissOnScrim ? onRequestClose : undefined}
        />
      </Animated.View>
      <View pointerEvents="box-none" style={styles.anchor}>
        <Animated.View
          testID={testID}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            height !== undefined
              ? { height: height + insets.bottom }
              : { maxHeight: windowHeight * 0.9 },
            glass && styles.sheetGlass,
            { paddingBottom: insets.bottom, transform: [{ translateY }] },
          ]}
        >
          {glass ? (
            <GlassSurface
              testID={testID ? `${testID}.glass` : undefined}
              fill={glassFill.sheet}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {showHandle ? <View style={styles.handle} /> : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  sheetGlass: { backgroundColor: 'transparent' },
  handle: {
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderRadius: HANDLE_HEIGHT / 2,
    backgroundColor: colors.border,
  },
});
