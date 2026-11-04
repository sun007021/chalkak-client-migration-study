import { Pressable, StyleSheet, View } from 'react-native';

import { colors, pretendardFor, spacing, typography } from '../../../shared/design/tokens';
import { Icon } from '../../../shared/ui/icons/Icon';
import { Text } from '../../../shared/ui/Text';

type Props = {
  title: string;
  /** 제목 옆 보조 글자("N/7"). */
  suffix?: string;
  suffixTestID?: string;
  moreLabel?: string;
  moreTestID?: string;
  onMorePress?: () => void;
};

/**
 * 홈 섹션 헤더(screens-a.md §7.6 HomeSectionHeader): 제목 headline bold, 접미 caption semibold textSecondary,
 * 오른쪽 "보러가기" caption + chevron 12(textPrimary). 가로 여백 screenHorizontal.
 */
export function SectionHeader({
  title,
  suffix,
  suffixTestID,
  moreLabel,
  moreTestID,
  onMorePress,
}: Props) {
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {suffix ? (
        <Text testID={suffixTestID} style={styles.suffix}>
          {suffix}
        </Text>
      ) : null}
      <View style={styles.spacer} />
      {onMorePress ? (
        <Pressable
          testID={moreTestID}
          accessibilityRole="button"
          accessibilityLabel={moreLabel ?? title}
          onPress={onMorePress}
          hitSlop={8}
          style={styles.more}
        >
          {moreLabel ? <Text style={styles.moreText}>{moreLabel}</Text> : null}
          <Icon name="ic_chevron_right" size={12} color={colors.textPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.screenHorizontal,
  },
  title: { ...typography.headline, fontFamily: pretendardFor('700'), color: colors.textPrimary },
  suffix: { ...typography.caption, fontFamily: pretendardFor('600'), color: colors.textSecondary },
  spacer: { flex: 1, minWidth: spacing.sm },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: spacing.sm },
  moreText: { ...typography.caption, color: colors.textPrimary },
});
