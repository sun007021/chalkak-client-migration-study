import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

import { useMemo } from 'react';

import type { FeedTarget } from '../features/feed/FeedTarget';
import { PlaceholderScreen } from '../features/placeholder/PlaceholderScreen';
import { IssueWebRoute } from './IssueWebRoute';
import { MainTabs } from './MainTabs';
import { PostDetailRoute } from './PostDetailRoute';
import type { RootStackParamList } from './navigation/routes';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** 탭 루트 위에 쌓이는 화면들. 쌓인 화면에서는 하단 바가 보이지 않는다(REQ-NAV-023). */
export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="PostDetail" component={PostDetailScreenRoute} />
      <Stack.Screen name="Notifications" component={NotificationsPlaceholder} />
      <Stack.Screen name="IssueWeb" component={IssueWebScreenRoute} />
      <Stack.Screen name="Upload" component={UploadPlaceholder} />
    </Stack.Navigator>
  );
}

const NotificationsPlaceholder = () => <PlaceholderScreen label="알림함" />;
const UploadPlaceholder = () => <PlaceholderScreen label="업로드" />;

function PostDetailScreenRoute({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'PostDetail'>) {
  const { postId, seed, entry, thumbnailUrl } = route.params;
  // 파라미터가 같은 동안 같은 target 객체를 쓴다(소유자가 ViewModel을 다시 만들지 않게).
  const target = useMemo<FeedTarget>(
    () => ({ postId, entry: entry ?? 'list', seed: seed ?? null, thumbnailUrl }),
    [postId, entry, seed, thumbnailUrl],
  );
  return <PostDetailRoute target={target} onBack={() => navigation.goBack()} />;
}

function IssueWebScreenRoute({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'IssueWeb'>) {
  return <IssueWebRoute url={route.params.url} onBack={() => navigation.goBack()} />;
}
