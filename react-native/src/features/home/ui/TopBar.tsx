import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../shared/ui/theme';
import { t } from '../../../shared/copy';

type Props = { hasUnread: boolean; onNotificationPress: () => void };

/** 상단 바: 알림 버튼과 미읽음 점(없으면 점 요소 자체가 없다). */
export function TopBar({ hasUnread, onNotificationPress }: Props) {
  return (
    <View style={styles.bar}>
      <Text style={styles.brand}>찰칵</Text>
      <Pressable
        testID="home.notification-button"
        accessibilityRole="button"
        accessibilityLabel={t('noti.inbox.title')}
        onPress={onNotificationPress}
        hitSlop={8}
        style={styles.bell}
      >
        <Text style={styles.bellText}>{t('noti.inbox.title')}</Text>
        {hasUnread ? <View testID="home.notification-unread-dot" style={styles.dot} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 48,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  bell: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  bellText: { fontSize: 14, color: colors.textPrimary },
  dot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
