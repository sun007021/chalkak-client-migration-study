import { StyleSheet, Text, View } from 'react-native';

import { t } from '../../shared/copy';

/** `API_BASE_URL` 누락·오류(REQ-NET-002). 요청을 보내지 않고 이 화면만 보인다. */
export function ConfigErrorScreen() {
  return (
    <View style={styles.root} testID="config-error.error-state">
      <Text>{t('common.error.config')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
