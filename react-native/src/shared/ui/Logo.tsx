import { colors, typography } from '../design/tokens';
import { Text } from './Text';

/** 브랜드 로고 글자: Continuous 30, 자간 -0.42(screens-a.md §1.7). */
export function ChalkakLogo() {
  return (
    <Text accessibilityLabel="찰캌" style={[typography.brand, { color: colors.textPrimary }]}>
      Chalkak
    </Text>
  );
}
