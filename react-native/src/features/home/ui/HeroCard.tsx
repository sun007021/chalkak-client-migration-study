import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { format, t } from '../../../shared/copy';
import { colors, spacing } from '../../../shared/ui/theme';
import type { HeroState } from '../HomeState';

/** 주제 제목이 없을 때 Empty 문구에 들어가는 말(home.md). 문구 키가 없어 여기 한 곳에 둔다(공용 문구 파일은 client가 고치지 않는다). */
export const TOPIC_TITLE_FALLBACK = '오늘의 주제';

type Props = {
  hero: HeroState;
  /** Empty 문구의 주제 자리. 제목이 없으면 "오늘의 주제". */
  topicTitle: string | null;
  onPress: () => void;
  onRetry: () => void;
};

/** D-06 히어로 7상태. 상태마다 testIDs.md의 서로 다른 요소 하나만 그린다. */
export function HeroCard({ hero, topicTitle, onPress, onRetry }: Props) {
  switch (hero.kind) {
    case 'loading':
      return <Card testID="home.hero-loading" message={t('home.topic.loading')} />;
    case 'no-open-topic':
      return <Card testID="home.hero-no-open-topic" message={t('home.hero.no-topic')} />;
    case 'processing':
      return <Card testID="home.hero-processing" message={t('home.hero.processing')} />;
    case 'empty':
      return (
        <View testID="home.hero-empty" style={styles.card}>
          <Pressable
            testID="home.hero-upload-button"
            accessibilityRole="button"
            onPress={onPress}
            style={styles.fill}
          >
            <Text style={styles.message}>
              {format(t('home.hero.empty'), { 주제: topicTitle ?? TOPIC_TITLE_FALLBACK })}
            </Text>
          </Pressable>
        </View>
      );
    case 'photo':
      return (
        <View testID="home.hero-photo" style={styles.card}>
          {hero.thumbnailUrl ? (
            <Image source={{ uri: hero.thumbnailUrl }} style={styles.fill} resizeMode="cover" />
          ) : null}
          {hero.pending ? (
            <View style={styles.badge}>
              <Text testID="home.hero-pending-badge" style={styles.badgeText}>
                {t('home.weekly.badge-pending')}
              </Text>
            </View>
          ) : null}
        </View>
      );
    case 'error':
      return (
        <View style={styles.card}>
          <Text testID="home.hero-error" style={styles.message}>
            {t('home.hero.error')}
          </Text>
          <Pressable
            testID="home.hero-retry-button"
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.retry}
          >
            <Text style={styles.retryText}>{t('home.hero.retry')}</Text>
          </Pressable>
        </View>
      );
  }
}

function Card({ testID, message }: { testID: string; message: string }) {
  return (
    <View testID={testID} style={styles.card}>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', padding: spacing.lg },
  badge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  retry: { paddingVertical: spacing.xs },
  retryText: { color: colors.accent, fontWeight: '600' },
});
