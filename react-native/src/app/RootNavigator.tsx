import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

import { useMemo } from 'react';

import { KstDate } from '../core/time/KstDate';
import { todayKst } from '../core/time/kst';
import type { FeedTarget } from '../features/feed/FeedTarget';
import { PlaceholderScreen } from '../features/placeholder/PlaceholderScreen';
import { PhotoUploadScreen } from '../features/upload/PhotoUploadScreen';
import { UploadSuccessScreen } from '../features/upload/UploadSuccessScreen';
import { useAppContainer } from './AppContainerContext';
import { useOwnedViewModel } from './useOwnedViewModel';
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
      <Stack.Screen
        name="PostDetail"
        component={PostDetailScreenRoute}
        // 상세가 열린 채 다른 게시물로 이동하면 같은 화면을 재사용하지 않고 새 화면을 쌓는다.
        getId={({ params }) => params.postId}
      />
      <Stack.Screen name="Notifications" component={NotificationsPlaceholder} />
      <Stack.Screen name="IssueWeb" component={IssueWebScreenRoute} />
      <Stack.Screen name="Upload" component={UploadScreenRoute} />
      <Stack.Screen
        name="UploadSuccess"
        component={UploadSuccessScreenRoute}
        // 성공 화면은 "확인했어요."로만 나간다(스와이프로 닫으면 기록 확인 흐름이 끊긴다).
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}

const NotificationsPlaceholder = () => <PlaceholderScreen label="알림함" />;

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

/**
 * 업로드 화면 라우트. 화면을 열 때 ViewModel을 만들고 닫을 때 dispose한다(진행 중 작업·임시 파일 정리).
 * 만들고 버리는 시점은 useOwnedViewModel이 구독(commit)에 맞춰 정하므로 StrictMode의 mount/unmount/mount에도 안전하다.
 */
function UploadScreenRoute({ route }: NativeStackScreenProps<RootStackParamList, 'Upload'>) {
  const container = useAppContainer();
  const { topicDate } = route.params;
  const viewModel = useOwnedViewModel(() =>
    container.createPhotoUploadViewModel(KstDate.parse(topicDate) ?? todayOf(container)),
  );
  return viewModel ? <PhotoUploadScreen viewModel={viewModel} /> : null;
}

function UploadSuccessScreenRoute({
  route,
}: NativeStackScreenProps<RootStackParamList, 'UploadSuccess'>) {
  const container = useAppContainer();
  const { topicTitle, topicDate, moderationStatus } = route.params;
  const viewModel = useOwnedViewModel(() =>
    container.createUploadSuccessViewModel({
      topicTitle,
      topicDate: KstDate.parse(topicDate) ?? todayOf(container),
      moderationStatus,
    }),
  );
  return viewModel ? <UploadSuccessScreen viewModel={viewModel} /> : null;
}

/** 라우트 파라미터가 날짜로 읽히지 않는 비정상 상황의 대비(내비게이터는 항상 yyyy-MM-dd를 싣는다). */
const todayOf = (container: ReturnType<typeof useAppContainer>): KstDate =>
  todayKst(container.clock);
