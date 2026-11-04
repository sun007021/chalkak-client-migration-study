import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import type { SignatureCardViewModel } from './SignatureCardViewModel';
import { colors, radius, spacing, typography } from '../../shared/design/tokens';
import { ChalkakButton } from '../../shared/ui/Button';
import { RoundIconButton } from '../../shared/ui/RoundIconButton';
import { Skeleton } from '../../shared/ui/Skeleton';
import { Text } from '../../shared/ui/Text';

/**
 * 설정 탭의 사인 카드(설정 화면이 배치한다). testID는 settings.signature-*.
 * 사인 PNG는 흰 획이라 어두운 바탕 위에 올린다. 이미지가 로드되지 않으면 이미지 자리만 비운다(카드는 유지).
 */
export function SignatureCard({ viewModel }: { viewModel: SignatureCardViewModel }) {
  const { imageUrl, loading, loadError } = useViewModelState(viewModel);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [wasLoading, setWasLoading] = useState(loading);
  // 다시 조회할 때마다 이미지 로드 실패 기록을 지운다(같은 URL도 다시 시도한다). 렌더 중 상태 보정 패턴.
  if (loading !== wasLoading) {
    setWasLoading(loading);
    if (loading) setFailedUrl(null);
  }
  const showImage = imageUrl !== null && imageUrl !== failedUrl;
  return (
    <View style={styles.wrapper}>
      <View testID="settings.signature-card" style={styles.card}>
        <Text style={styles.title}>{t('sign.card.title')}</Text>
        <View style={styles.imageBox}>
          {showImage ? (
            <Image
              testID="settings.signature-image"
              source={{ uri: imageUrl }}
              resizeMode="contain"
              onError={() => setFailedUrl(imageUrl)}
              style={styles.image}
            />
          ) : null}
          {loadError ? (
            <View style={styles.errorBox}>
              <Text testID="settings.signature-error" style={styles.errorText}>
                {t('sign.load.error')}
              </Text>
              <RoundIconButton
                testID="settings.signature-retry-button"
                accessibilityLabel={t('common.retry')}
                size={32}
                iconSize={15}
                onPress={() => void viewModel.refresh()}
              />
            </View>
          ) : null}
          {loading ? (
            <View testID="settings.signature-loading" style={StyleSheet.absoluteFill}>
              <Skeleton style={StyleSheet.absoluteFill} />
            </View>
          ) : null}
        </View>
      </View>
      <ChalkakButton
        testID="settings.signature-change-button"
        label={t('sign.card.change')}
        verticalPadding={13}
        onPress={() => viewModel.onChangePress()}
      />
    </View>
  );
}

// 사인 PNG는 흰 획이라 actionPrimary 바탕 위에 올린다(원본 사인 패드와 같은 어두운 면).
const styles = StyleSheet.create({
  wrapper: { gap: spacing.md },
  card: {
    borderRadius: radius.large,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { ...typography.headline, color: colors.textPrimary },
  imageBox: {
    height: 96,
    borderRadius: radius.button,
    overflow: 'hidden',
    backgroundColor: colors.actionPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  errorBox: { alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  errorText: { ...typography.footnote, color: colors.onActionPrimary, textAlign: 'center' },
});
