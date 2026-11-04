import { StyleSheet, View } from 'react-native';

import { t } from '../../shared/copy';
import { colors, spacing, typography } from '../../shared/design/tokens';
import { Text } from '../../shared/ui/Text';

/** `API_BASE_URL` 누락·오류(REQ-NET-002). 요청을 보내지 않고 이 화면만 보인다. */
export function ConfigErrorScreen() {
  return (
    <View style={styles.root} testID="config-error.error-state">
      <Text style={styles.message}>{t('common.error.config')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenHorizontal,
    backgroundColor: colors.background,
  },
  message: { ...typography.callout, color: colors.textSecondary, textAlign: 'center' },
});
