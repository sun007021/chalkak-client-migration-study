import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../core/state/useViewModelState';
import { t } from '../shared/copy';
import { colors, spacing } from '../shared/ui/theme';
import { useAppContainer } from './AppContainerContext';
import type { TabRouteName } from './navigation/routes';

type TabSpec = {
  testID: string;
  label: string;
  destination: 'home' | 'display' | 'record' | 'settings';
};

/** testID는 docs/testing/testids.md의 bottom-bar.* 그대로, 라벨은 nav.tab.*. */
const TABS: Record<TabRouteName, TabSpec> = {
  Home: { testID: 'bottom-bar.tab-home', label: t('nav.tab.home'), destination: 'home' },
  Display: {
    testID: 'bottom-bar.tab-display',
    label: t('nav.tab.display'),
    destination: 'display',
  },
  Record: { testID: 'bottom-bar.tab-record', label: t('nav.tab.record'), destination: 'record' },
  Settings: {
    testID: 'bottom-bar.tab-settings',
    label: t('nav.tab.settings'),
    destination: 'settings',
  },
};

/**
 * 하단 바: 홈, 전시, [업로드 버튼], 기록, 설정. 선택 표시는 탭 네 개 중 하나에만 있고 업로드 버튼은 탭이 아니다(REQ-NAV-001~002).
 * 게스트는 기록 탭이 막히고(토스트), 업로드 버튼은 토스트만 띄운다(D-05). 탭을 누를 때마다(재선택 포함) 분석 이벤트를 보낸다(REQ-NAV-009).
 */
export function BottomBar({ state, navigation }: BottomTabBarProps) {
  const { bootViewModel, analytics, toast } = useAppContainer();
  const { mode } = useViewModelState(bootViewModel);
  const insets = useSafeAreaInsets();
  const focusedName = state.routes[state.index]?.name;

  const onTabPress = (name: TabRouteName, routeKey: string) => {
    if (name === 'Record' && mode === 'guest') {
      toast.show(t('nav.guest.record'));
      return;
    }
    analytics.logEvent('bottom_navigation_selected', { destination: TABS[name].destination });
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (focusedName !== name && !event.defaultPrevented) navigation.navigate(name);
  };

  const onUploadPress = () => {
    if (mode === 'guest') toast.show(t('nav.guest.upload'));
    else navigation.getParent()?.navigate('Upload' as never);
  };

  const tab = (name: TabRouteName) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return null;
    const spec = TABS[name];
    const selected = focusedName === name;
    return (
      <Pressable
        key={name}
        testID={spec.testID}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        onPress={() => onTabPress(name, route.key)}
        style={styles.tab}
      >
        <Text style={[styles.label, selected && styles.selected]}>{spec.label}</Text>
      </Pressable>
    );
  };

  return (
    <View testID="bottom-bar.root" style={[styles.root, { paddingBottom: insets.bottom }]}>
      {tab('Home')}
      {tab('Display')}
      <Pressable
        testID="bottom-bar.upload-button"
        accessibilityRole="button"
        accessibilityLabel={t('nav.tab.upload.a11y')}
        onPress={onUploadPress}
        style={styles.upload}
      >
        <Text style={styles.uploadText}>+</Text>
      </Pressable>
      {tab('Record')}
      {tab('Settings')}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  tab: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, color: colors.textSecondary },
  selected: { color: colors.textPrimary, fontWeight: '700' },
  upload: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  uploadText: { fontSize: 28, lineHeight: 30, color: '#FFFFFF' },
});
