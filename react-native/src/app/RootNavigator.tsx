import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { PlaceholderScreen } from '../features/placeholder/PlaceholderScreen';

export type RootStackParamList = { Placeholder: undefined };

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Placeholder" component={PlaceholderScreen} />
    </Stack.Navigator>
  );
}
