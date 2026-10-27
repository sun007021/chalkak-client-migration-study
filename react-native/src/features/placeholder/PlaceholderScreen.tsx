import { StyleSheet, Text, View } from 'react-native';

/** 아직 구현되지 않은 목적지의 자리표시자. `label`은 어느 자리인지 개발 중 눈으로 구분하기 위한 표시다. */
export function PlaceholderScreen({ label = '찰캌' }: { label?: string }) {
  return (
    <View style={styles.root} testID="placeholder.root">
      <Text>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
