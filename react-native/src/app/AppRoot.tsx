import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { useEffect, type ComponentProps } from 'react';
import { View } from 'react-native';

import { colors, fontAssets } from '../shared/design/tokens';
import { App } from './App';

type AppRootProps = ComponentProps<typeof App>;

/**
 * 번들 글꼴(Pretendard, Continuous, 손글씨)을 로드하고, 끝나기 전에는 네이티브 스플래시를 유지한다
 * (시스템 글꼴이 먼저 보이는 깜빡임 방지). 로딩이 실패해도 앱은 시작한다(시스템 글꼴로 대체).
 */
export function AppRoot(props: AppRootProps) {
  const [loaded, error] = useFonts(fontAssets);
  const ready = loaded || error !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.logoBackground }} />;
  return <App {...props} />;
}
