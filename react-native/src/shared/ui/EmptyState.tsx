import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing, typography } from '../design/tokens';
import { Icon } from './icons/Icon';
import { Text } from './Text';

export type EmptyStateProps = {
  title: string;
  subtitle?: string;
  /** 큰 아이콘(34, iconSecondary)을 보일지. 전시·작가 게시물 빈 상태가 쓴다. */
  showIcon?: boolean;
  testID?: string;
  titleTestID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * 빈 상태(screens-b.md §2.4, screens-a.md §1.11): 아이콘 34 iconSecondary + body textSecondary 문구, 간격 sm,
 * 보조 문구는 subheadline textMuted.
 */
export function EmptyState({
  title,
  subtitle,
  showIcon = true,
  testID,
  titleTestID,
  style,
}: EmptyStateProps) {
  return (
    <View testID={testID} style={[styles.root, style]}>
      {showIcon ? <Icon name="ic_photo_library" size={34} color={colors.iconSecondary} /> : null}
      <Text testID={titleTestID} style={styles.title}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.screenHorizontal },
  title: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  subtitle: { ...typography.subheadline, color: colors.textMuted, textAlign: 'center' },
});
