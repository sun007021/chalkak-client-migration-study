import { BlurView } from 'expo-blur';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../design/tokens';

// 원본 근거: docs/design/README.md §5.2 (RN, iOS에서 실행). 원본 ChalkakPlatformAppearance.usesLiquidGlass.
// iOS 26 이상 + 투명도 줄이기 꺼짐일 때만 유리를 근사하고, 그 외(Android, iOS 26 미만)는 평면이다.
const GLASS_MIN_IOS = 26;
const BLUR_INTENSITY = 60;

/** 순수 판단. 테스트에서 직접 호출한다. */
export function computeUsesGlass(input: {
  os: string;
  version: string | number;
  reduceTransparency: boolean;
}): boolean {
  if (input.os !== 'ios') return false;
  const major = parseInt(String(input.version), 10);
  return Number.isFinite(major) && major >= GLASS_MIN_IOS && !input.reduceTransparency;
}

const GlassContext = createContext<boolean | null>(null);

/** 테스트나 디버그에서 유리 여부를 고정한다. 없으면 OS 버전과 접근성 설정으로 정한다. */
export function GlassOverride({ value, children }: { value: boolean; children: ReactNode }) {
  return <GlassContext.Provider value={value}>{children}</GlassContext.Provider>;
}

export function useUsesGlass(): boolean {
  const override = useContext(GlassContext);
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (override !== null || Platform.OS !== 'ios') return;
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((v) => {
        if (alive) setReduce(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, [override]);
  if (override !== null) return override;
  return computeUsesGlass({
    os: Platform.OS,
    version: Platform.Version,
    reduceTransparency: reduce,
  });
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export const glassFill = {
  /** 하단 바·원형 버튼: background 30% */
  bar: withAlpha(colors.background, 0.3),
  /** 시트: surfaceElevated 70% */
  sheet: withAlpha(colors.surfaceElevated, 0.7),
  /** 선택 렌즈: 흰색 45% */
  lens: 'rgba(255,255,255,0.45)',
};

/** 블러 위에 채움 색과 흰색 35% 0.5px 테두리를 얹는 유리 재질. 모양(라운드)은 style이 정한다. */
export function GlassSurface({
  fill,
  style,
  children,
  testID,
}: {
  fill: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.clip, style]}>
      <BlurView tint="light" intensity={BLUR_INTENSITY} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim, style]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  rim: { borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'transparent' },
});

/** 유리 하단 바 캡슐의 높이(탭 48 + 위아래 8). BottomBar의 캡슐과 같은 값이다. */
export const GLASS_BAR_HEIGHT = 64;

/**
 * 탭 화면 스크롤 콘텐츠 아래에 줄 inset. 유리 하단 바는 콘텐츠 위에 떠 있으므로(절대 배치)
 * 바 높이 + 아래 여백 + 안전 영역만큼 비워 마지막 항목이 가려지지 않게 한다. 평면이면 0.
 */
export function useGlassBarInset(): number {
  const glass = useUsesGlass();
  const insets = useSafeAreaInsets();
  return glass ? GLASS_BAR_HEIGHT + spacing.sm + insets.bottom : 0;
}
