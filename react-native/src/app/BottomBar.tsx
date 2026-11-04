import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../core/state/useViewModelState';
import { t } from '../shared/copy';
import { colors, pretendardFor, typography } from '../shared/design/tokens';
import { Icon } from '../shared/ui/icons/Icon';
import type { IconName } from '../shared/ui/icons/iconData';
import { useAppContainer } from './AppContainerContext';
import { BottomTabPolicy } from './BottomTabPolicy';
import type { TabRouteName } from './navigation/routes';
import { Text } from '../shared/ui/Text';

type TabSpec = { testID: string; label: string; icon: IconName; iconSelected: IconName };

/** testID는 docs/testing/testids.md의 bottom-bar.* 그대로, 라벨은 nav.tab.*. 아이콘은 ic_bottom_*(일반/선택). */
const TABS: Record<TabRouteName, TabSpec> = {
  Home: {
    testID: 'bottom-bar.tab-home',
    label: t('nav.tab.home'),
    icon: 'ic_bottom_home',
    iconSelected: 'ic_bottom_home_selected',
  },
  Display: {
    testID: 'bottom-bar.tab-display',
    label: t('nav.tab.display'),
    icon: 'ic_bottom_display',
    iconSelected: 'ic_bottom_display_selected',
  },
  Record: {
    testID: 'bottom-bar.tab-record',
    label: t('nav.tab.record'),
    icon: 'ic_bottom_record',
    iconSelected: 'ic_bottom_record_selected',
  },
  Settings: {
    testID: 'bottom-bar.tab-settings',
    label: t('nav.tab.settings'),
    icon: 'ic_bottom_setting',
    iconSelected: 'ic_bottom_setting_selected',
  },
};

// 원본 Flat 바(screens-a.md §3.3·3.6): 위 15 / 아래 12(+안전 영역), surfaceElevated, 아이템 최소 48,
// 아이콘 23 + 간격 7 + 라벨 footnote(선택 시 bold), 선택 actionPrimary / 비선택 bottomBar, 작성 버튼 40 원.
const ICON_SIZE = 23;
const WRITE_SIZE = 40;

/**
 * 하단 바: 홈, 전시, [업로드 버튼], 기록, 설정. 선택 표시는 탭 네 개 중 하나에만 있고 업로드 버튼은 탭이 아니다(REQ-NAV-001~002).
 * 게스트 차단·토스트·분석 이벤트는 BottomTabPolicy가 정하고(순수 TS, 단위 테스트), 이 컴포넌트는 그 결과대로 이동만 한다.
 */
export function BottomBar({ state, navigation }: BottomTabBarProps) {
  const { bootViewModel, analytics, toast, uploadGateOwner } = useAppContainer();
  const { mode } = useViewModelState(bootViewModel);
  const policy = useMemo(
    () => new BottomTabPolicy({ mode, analytics, toast }),
    [mode, analytics, toast],
  );
  const insets = useSafeAreaInsets();
  const focusedName = state.routes[state.index]?.name;

  const onTabPress = (name: TabRouteName, routeKey: string) => {
    if (policy.onTabPress(name) === 'blocked') return;
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (focusedName !== name && !event.defaultPrevented) navigation.navigate(name);
  };

  const onUploadPress = () => {
    // 게스트는 정책이 토스트로 막고, 회원은 게이트(GET /posts/today 확인)를 지나야 업로드 화면이 열린다.
    if (policy.onUploadPress() === 'open-upload') uploadGateOwner.press();
  };

  const tab = (name: TabRouteName) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return null;
    const spec = TABS[name];
    const selected = focusedName === name;
    const color = selected ? colors.actionPrimary : colors.bottomBar;
    return (
      <Pressable
        key={name}
        testID={spec.testID}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        onPress={() => onTabPress(name, route.key)}
        style={styles.tab}
      >
        <Icon name={selected ? spec.iconSelected : spec.icon} size={ICON_SIZE} color={color} />
        <Text style={[styles.label, { color }, selected && styles.selected]}>{spec.label}</Text>
      </Pressable>
    );
  };

  return (
    <View testID="bottom-bar.root" style={[styles.root, { paddingBottom: insets.bottom + 12 }]}>
      {tab('Home')}
      {tab('Display')}
      <View style={styles.slot}>
        <Pressable
          testID="bottom-bar.upload-button"
          accessibilityRole="button"
          accessibilityLabel={t('nav.tab.upload.a11y')}
          onPress={onUploadPress}
          style={({ pressed }) => [styles.upload, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Icon name="ic_bottom_write" size={WRITE_SIZE} />
        </Pressable>
      </View>
      {tab('Record')}
      {tab('Settings')}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 15,
    backgroundColor: colors.surfaceElevated,
  },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 7 },
  label: { ...typography.footnote },
  selected: { fontFamily: pretendardFor('700') },
  slot: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  upload: { width: WRITE_SIZE, height: WRITE_SIZE, alignItems: 'center', justifyContent: 'center' },
});
