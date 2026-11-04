import { Pressable, StyleSheet, View } from 'react-native';

import { t } from '../../../shared/copy';
import { colors, spacing } from '../../../shared/design/tokens';
import { Icon } from '../../../shared/ui/icons/Icon';
import { ChalkakLogo } from '../../../shared/ui/Logo';

type Props = { hasUnread: boolean; onNotificationPress: () => void };

// 원본 HomeTopBar(screens-a.md §7.2): 높이 55, 로고 + 알림 버튼(아이콘 24, 터치 44), 미읽음 점 지름 7 inputCursor,
// 배경 background 96%, 아래 구분선 border.
const BAR_HEIGHT = 55;
const DOT = 7;

/** 상단 바: 알림 버튼과 미읽음 점(없으면 점 요소 자체가 없다). */
export function TopBar({ hasUnread, onNotificationPress }: Props) {
  return (
    <View style={styles.bar}>
      <ChalkakLogo />
      <Pressable
        testID="home.notification-button"
        accessibilityRole="button"
        accessibilityLabel={t('noti.inbox.title')}
        accessibilityValue={{ text: hasUnread ? '읽지 않은 알림 있음' : '읽지 않은 알림 없음' }}
        onPress={onNotificationPress}
        style={styles.bell}
      >
        <Icon name="ic_notification" size={24} color={colors.iconPrimary} />
        {hasUnread ? <View testID="home.notification-unread-dot" style={styles.dot} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: BAR_HEIGHT,
    paddingLeft: spacing.screenHorizontal,
    paddingRight: spacing.screenHorizontal - 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(247,246,243,0.96)',
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: colors.border,
  },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.inputCursor,
  },
});
