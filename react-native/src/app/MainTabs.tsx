import { createBottomTabNavigator, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { BackHandler, View } from 'react-native';

import { useViewModelState } from '../core/state/useViewModelState';
import { KstDate } from '../core/time/KstDate';
import { DisplayScreen } from '../features/display/DisplayScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { PlaceholderScreen } from '../features/placeholder/PlaceholderScreen';
import { RecordScreen } from '../features/record/RecordScreen';
import { CalendarImageCaptureHost } from '../features/record/ui/CalendarImageCaptureHost';
import { useAppContainer } from './AppContainerContext';
import { BottomBar } from './BottomBar';
import type { TabParamList } from './navigation/routes';

const Tab = createBottomTabNavigator<TabParamList>();

/** 하단 탭 네 개의 루트. 홈 외에는 해당 기능 PR이 채우기 전까지 placeholder다. */
export function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <BottomBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeTab} />
      <Tab.Screen name="Display" component={DisplayTab} />
      <Tab.Screen name="Record" component={RecordTab} />
      <Tab.Screen name="Settings" component={SettingsTab} />
    </Tab.Navigator>
  );
}

/**
 * 홈 탭. ViewModel은 소유자(homeOwner)가 메인에 들어올 때 만들고 로그아웃 때 버리므로 여기서는 받아서 그리기만 한다.
 * 화면은 탭이 포커스일 때만 마운트한다: 선택할 때마다 상태 복원 없이 새로 보이고(REQ-NAV-004), 마운트 = onShown이라
 * 탭 복귀·알림함/상세에서 돌아옴이 모두 "다시 보임"으로 처리된다(REQ-HOME-040·043·045).
 */
function HomeTab() {
  const { homeOwner, analytics } = useAppContainer();
  const { viewModel } = useViewModelState(homeOwner);
  const focused = useIsFocused();
  useFocusEffect(useCallback(() => analytics.screenView('home'), [analytics]));
  if (!viewModel || !focused) return <View style={{ flex: 1 }} />;
  return <HomeScreen viewModel={viewModel} />;
}

/**
 * 전시 탭. ViewModel은 소유자(displayOwner)가 메인에 들어올 때 만들고 로그아웃 때 버린다(탭을 오가도 캐시·시드가 남는다).
 * 홈 랭킹 더보기·기록·업로드 성공이 싣고 온 날짜(와 정렬)는 화면을 그리기 전에 ViewModel에 전하고 파라미터를 비운다
 * (비우지 않으면 탭에 돌아올 때마다 다시 그 날짜로 열린다). 이미 전시를 보는 중에 전시 탭을 다시 누르면 맨 위로 + 재검증이다.
 */
function DisplayTab({ route, navigation }: BottomTabScreenProps<TabParamList, 'Display'>) {
  const { displayOwner, analytics, tabReturnHint } = useAppContainer();
  const { viewModel } = useViewModelState(displayOwner);
  const focused = useIsFocused();
  const requestedDate = route.params?.date;
  const requestedSort = route.params?.sort;
  useFocusEffect(useCallback(() => analytics.screenView('display'), [analytics]));

  useEffect(() => {
    if (!viewModel || !requestedDate) return;
    const date = KstDate.parse(requestedDate);
    if (date) void viewModel.openDate(date, requestedSort);
    navigation.setParams({ date: undefined, sort: undefined });
  }, [viewModel, requestedDate, requestedSort, navigation]);

  // 기록이 연 전시에서만(힌트가 있을 때) 뒤로 가기가 그 탭으로 돌아간다(REQ-NAV-030). 그 밖에는 기본 백 동작(홈, REQ-NAV-026).
  // 힌트는 전시 탭을 떠나는 순간 지워 다음에 하단 바로 올 때 영향이 없게 한다.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        const target = tabReturnHint.get();
        if (target === null) return false;
        tabReturnHint.clear();
        navigation.navigate(target);
        return true;
      });
      return () => {
        subscription.remove();
        // 다른 탭으로 옮겨 갔을 때만 지운다. 상세 같은 스택 화면이 위에 덮인 것뿐이면 돌아와서도 기록으로 되돌아가야 한다.
        const { routes, index } = navigation.getState();
        if (routes[index]?.name !== 'Display') tabReturnHint.clear();
      };
    }, [navigation, tabReturnHint]),
  );

  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        // 다른 탭에서 올 때도 이 이벤트가 오므로 이미 포커스일 때(재선택)만 처리한다.
        if (navigation.isFocused() && viewModel) {
          tabReturnHint.clear();
          void viewModel.onTabReselected();
        }
      }),
    [navigation, viewModel, tabReturnHint],
  );

  if (!viewModel || !focused || requestedDate) return <View style={{ flex: 1 }} />;
  return <DisplayScreen viewModel={viewModel} />;
}

/**
 * 기록 탭. ViewModel은 소유자(recordOwner)가 메인에 들어올 때 만들고 로그아웃 때 버린다(탭을 오가도 월별 캐시가 남는다).
 * 홈 주간 기록이 싣고 온 날짜(`selectedDate`, 없으면 null)는 화면을 그리기 전에 ViewModel에 전하고 파라미터를 비운다
 * (비우지 않으면 탭에 돌아올 때마다 같은 날짜로 열린다). 이미 기록을 보는 중에 기록 탭을 다시 누르면 재검증이다.
 * 기본 렌더러를 쓸 때는 달력 이미지 캡처 호스트도 함께 마운트한다.
 */
function RecordTab({ route, navigation }: BottomTabScreenProps<TabParamList, 'Record'>) {
  const { recordOwner, analytics, calendarCapture } = useAppContainer();
  const { viewModel } = useViewModelState(recordOwner);
  const focused = useIsFocused();
  const requested = route.params?.selectedDate;
  const hasRequest = requested !== undefined;
  useFocusEffect(useCallback(() => analytics.screenView('record'), [analytics]));

  useEffect(() => {
    if (!viewModel || !hasRequest) return;
    void viewModel.openDate(requested ? KstDate.parse(requested) : null);
    navigation.setParams({ selectedDate: undefined });
  }, [viewModel, hasRequest, requested, navigation]);

  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        // 다른 탭에서 올 때도 이 이벤트가 오므로 이미 포커스일 때(재선택)만 처리한다.
        if (navigation.isFocused() && viewModel) void viewModel.onTabReselected();
      }),
    [navigation, viewModel],
  );

  if (!viewModel || !focused || hasRequest) return <View style={{ flex: 1 }} />;
  return (
    <View style={{ flex: 1 }}>
      <RecordScreen viewModel={viewModel} />
      {calendarCapture ? <CalendarImageCaptureHost renderer={calendarCapture} /> : null}
    </View>
  );
}
const SettingsTab = () => <PlaceholderScreen label="설정" />;
