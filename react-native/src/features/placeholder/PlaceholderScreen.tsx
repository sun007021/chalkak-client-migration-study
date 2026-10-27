import { StyleSheet, Text, View } from 'react-native';

export function PlaceholderScreen() {
  return (
    <View style={styles.root} testID="placeholder.root">
      <Text>찰캌</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
