import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

import { PlaceholderScreen } from '../features/placeholder/PlaceholderScreen';
import { IssueWebRoute } from './IssueWebRoute';
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
      <Stack.Screen name="IssueWeb" component={IssueWebScreenRoute} />
      <Stack.Screen name="Upload" component={UploadPlaceholder} />
    </Stack.Navigator>
  );
}

const PostDetailPlaceholder = () => <PlaceholderScreen label="게시물 상세" />;
const NotificationsPlaceholder = () => <PlaceholderScreen label="알림함" />;
const UploadPlaceholder = () => <PlaceholderScreen label="업로드" />;

function IssueWebScreenRoute({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'IssueWeb'>) {
  return <IssueWebRoute url={route.params.url} onBack={() => navigation.goBack()} />;
}
