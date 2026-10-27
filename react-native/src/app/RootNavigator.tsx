import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { useState } from 'react';

import { IssueWebScreen } from '../features/banner/IssueWebScreen';
import { PlaceholderScreen } from '../features/placeholder/PlaceholderScreen';
import { useAppContainer } from './AppContainerContext';
import { MainTabs } from './MainTabs';
import type { RootStackParamList } from './navigation/routes';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** 탭 루트 위에 쌓이는 화면들. 쌓인 화면에서는 하단 바가 보이지 않는다(REQ-NAV-023). */
export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="PostDetail" component={PostDetailPlaceholder} />
      <Stack.Screen name="Notifications" component={NotificationsPlaceholder} />
      <Stack.Screen name="IssueWeb" component={IssueWebRoute} />
      <Stack.Screen name="Upload" component={UploadPlaceholder} />
    </Stack.Navigator>
  );
}

const PostDetailPlaceholder = () => <PlaceholderScreen label="게시물 상세" />;
const NotificationsPlaceholder = () => <PlaceholderScreen label="알림함" />;
const UploadPlaceholder = () => <PlaceholderScreen label="업로드" />;

/**
 * 배너 웹뷰 화면의 소유자. ViewModel은 화면이 아니라 이 내비게이션 단계(라우트)가 만든다.
 * 라우트가 살아 있는 동안 같은 인스턴스를 쓰고, 구독하는 자원이 없어 dispose할 것이 없다.
 */
function IssueWebRoute({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'IssueWeb'>) {
  const container = useAppContainer();
  const [viewModel] = useState(() => container.createIssueWebViewModel(route.params.url));
  return <IssueWebScreen viewModel={viewModel} onBack={() => navigation.goBack()} />;
}
