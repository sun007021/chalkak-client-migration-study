import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import type { SignatureCardViewModel } from './SignatureCardViewModel';

/**
 * 설정 탭의 사인 카드(설정 화면이 배치한다). testID는 settings.signature-*.
 * 사인 PNG는 흰 획이라 어두운 바탕 위에 올린다. 이미지가 로드되지 않으면 이미지 자리만 비운다(카드는 유지).
 */
export function SignatureCard({ viewModel }: { viewModel: SignatureCardViewModel }) {
  const { imageUrl, loading } = useViewModelState(viewModel);
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
          {loading ? (
            <ActivityIndicator testID="settings.signature-loading" color="#FFFFFF" />
          ) : null}
        </View>
      </View>
      <Pressable
        testID="settings.signature-change-button"
        accessibilityRole="button"
        onPress={() => viewModel.onChangePress()}
        style={styles.change}
      >
        <Text style={styles.changeText}>{t('sign.card.change')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 12 },
  card: { borderRadius: 16, backgroundColor: '#FFFFFF', padding: 16, gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#111111' },
  imageBox: {
    height: 96,
    borderRadius: 12,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  change: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
