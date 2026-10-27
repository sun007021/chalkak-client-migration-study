import { StyleSheet, Text, View } from 'react-native';

/** testID `splash.logo`. 사용자 입력 없음. 로고 이미지는 디자인 반영 PR에서 교체한다. */
export function SplashView() {
  return (
    <View style={styles.root}>
      <Text testID="splash.logo" style={styles.logo}>
        찰캌
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  logo: { fontSize: 32, fontWeight: '700' },
});
