import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../shared/ui/theme';
import { likeAccessibilityLabel } from './likeLabel';

type Props = {
  buttonTestID: string;
  countTestID: string;
  isLiked: boolean;
  likeCount: number;
  disabled?: boolean;
  onPress: () => void;
  /** 사진 위에 올릴 때는 흰 글자로 그린다. */
  onPhoto?: boolean;
};

/** 전시 그리드·추천 카드·상세가 같이 쓰는 하트 버튼. selected로 좋아요 여부를, 접근성 라벨로 개수를 알린다. */
export function LikeButton({
  buttonTestID,
  countTestID,
  isLiked,
  likeCount,
  disabled = false,
  onPress,
  onPhoto = false,
}: Props) {
  const tone = onPhoto ? styles.onPhoto : styles.plain;
  return (
    <Pressable
      testID={buttonTestID}
      accessibilityRole="button"
      accessibilityLabel={likeAccessibilityLabel(likeCount)}
      accessibilityState={{ selected: isLiked }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[styles.root, disabled && styles.disabled]}
    >
      <Text style={[styles.icon, tone, isLiked && styles.liked]}>{isLiked ? '♥' : '♡'}</Text>
      <View>
        <Text testID={countTestID} style={[styles.count, tone]}>
          {String(likeCount)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  disabled: { opacity: 0.5 },
  icon: { fontSize: 18 },
  count: { fontSize: 13 },
  plain: { color: colors.textSecondary },
  onPhoto: { color: '#FFFFFF' },
  liked: { color: colors.accent },
});
