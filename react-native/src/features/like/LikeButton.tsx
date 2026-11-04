import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing, typography } from '../../shared/design/tokens';
import { Icon } from '../../shared/ui/icons/Icon';
import { Text } from '../../shared/ui/Text';
import { likeAccessibilityLabel } from './likeLabel';

type Props = {
  buttonTestID: string;
  countTestID: string;
  isLiked: boolean;
  likeCount: number;
  disabled?: boolean;
  onPress: () => void;
  /** 사진 위에 올리는 배지(하트 18 + subheadline, 흰색, 옅은 그림자). 아니면 액션 행(하트 24 + body). */
  onPhoto?: boolean;
};

/**
 * 전시 그리드·추천 카드·상세가 같이 쓰는 하트 버튼. selected로 좋아요 여부를, 접근성 라벨로 개수를 알린다.
 * 원본 수치(screens-b.md §2.2, screens-a.md §8.1): 배지는 하트 18 · 간격 4 · textOnImage, 액션 행은 하트 24 · 간격 9,
 * 좋아요 시 actionPrimary, 아니면 textSecondary. 터치 영역은 최소 44.
 */
export function LikeButton({
  buttonTestID,
  countTestID,
  isLiked,
  likeCount,
  disabled = false,
  onPress,
  onPhoto = false,
}: Props) {
  const iconColor = onPhoto
    ? colors.textOnImage
    : isLiked
      ? colors.actionPrimary
      : colors.textSecondary;
  return (
    <Pressable
      testID={buttonTestID}
      accessibilityRole="button"
      accessibilityLabel={likeAccessibilityLabel(likeCount)}
      accessibilityState={{ selected: isLiked }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={onPhoto ? { top: 14, right: 14, bottom: 10, left: 10 } : 8}
      style={[styles.root, onPhoto ? styles.badgeGap : styles.rowGap, disabled && styles.disabled]}
    >
      <Icon
        name={isLiked ? 'ic_heart_filled' : 'ic_heart'}
        size={onPhoto ? 18 : 24}
        color={iconColor}
      />
      <View>
        <Text testID={countTestID} style={[onPhoto ? styles.badgeCount : styles.rowCount]}>
          {String(likeCount)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  badgeGap: { gap: spacing.xs },
  rowGap: { gap: 9, minHeight: 44 },
  disabled: { opacity: 0.5 },
  badgeCount: {
    ...typography.subheadline,
    color: colors.textOnImage,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 1 },
  },
  rowCount: { ...typography.body, color: colors.textSecondary },
});
