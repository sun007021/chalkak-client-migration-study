import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../state/useViewModelState';
import type { ToastCenter } from './ToastCenter';

/** 화면 위에 토스트를 그린다. 떠 있는 동안만 요소가 존재한다(testIDs.md toast.*). 터치는 아래 화면으로 통과시킨다. */
export function ToastHost({ center }: { center: ToastCenter }) {
  const { current } = useViewModelState(center);
  const insets = useSafeAreaInsets();
  if (current === null) return null;
  return (
    <View pointerEvents="none" style={[styles.layer, { bottom: insets.bottom + 96 }]}>
      <View key={current.id} testID="toast.container" style={styles.toast}>
        <Text testID="toast.message" style={styles.text}>
          {current.message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    maxWidth: '86%',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(25,25,25,0.92)',
  },
  text: { color: '#FFFFFF', fontSize: 14, textAlign: 'center' },
});
