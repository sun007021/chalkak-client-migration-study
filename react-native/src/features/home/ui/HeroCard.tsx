import { Pressable, StyleSheet, View } from 'react-native';

import { format, t } from '../../../shared/copy';
import { colors, pretendardFor, radius, spacing, typography } from '../../../shared/design/tokens';
import { Icon } from '../../../shared/ui/icons/Icon';
import { RemoteImage } from '../../../shared/ui/RemoteImage';
import { RoundIconButton } from '../../../shared/ui/RoundIconButton';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { Text } from '../../../shared/ui/Text';
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

// 원본 HomeHeroCard(screens-a.md §7.4): 5:6 비율, 라운드 photoCard(12), 안내 상태는 surface 바탕 + 1px border.
const ASPECT = 5 / 6;
const PLUS_SIZE = 36;

/** D-06 히어로 7상태. 상태마다 testIDs.md의 서로 다른 요소 하나만 그린다. */
export function HeroCard({ hero, topicTitle, onPress, onRetry }: Props) {
  switch (hero.kind) {
    case 'loading':
      // 스피너 대신 스켈레톤(쉬머) 위에 안내 문구를 얹는다.
      return (
        <View testID="home.hero-loading" style={[styles.card, styles.center]}>
          <Skeleton style={StyleSheet.absoluteFill} />
          <Text style={styles.statusMessage}>{t('home.topic.loading')}</Text>
        </View>
      );
    case 'no-open-topic':
      return <StatusCard testID="home.hero-no-open-topic" message={t('home.hero.no-topic')} />;
    case 'processing':
      return <StatusCard testID="home.hero-processing" message={t('home.hero.processing')} />;
    case 'empty':
      return (
        <View testID="home.hero-empty" style={[styles.card, styles.outlined]}>
          <Pressable
            testID="home.hero-upload-button"
            accessibilityRole="button"
            onPress={onPress}
            style={styles.fill}
          >
            <Text style={styles.emptyMessage}>
              {format(t('home.hero.empty'), { 주제: topicTitle ?? TOPIC_TITLE_FALLBACK })}
            </Text>
            <Icon name="ic_bottom_write" size={PLUS_SIZE} />
          </Pressable>
        </View>
      );
    case 'photo':
      return (
        <View testID="home.hero-photo" style={[styles.card, styles.photoBackdrop]}>
          <RemoteImage uri={hero.thumbnailUrl} style={StyleSheet.absoluteFill} />
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
        <View style={[styles.card, styles.outlined, styles.center]}>
          <Text testID="home.hero-error" style={styles.statusMessage}>
            {t('home.hero.error')}
          </Text>
          <RoundIconButton
            testID="home.hero-retry-button"
            accessibilityLabel={t('home.hero.retry')}
            onPress={onRetry}
          />
        </View>
      );
  }
}

function StatusCard({ testID, message }: { testID: string; message: string }) {
  return (
    <View testID={testID} style={[styles.card, styles.outlined, styles.center]}>
      <Text style={styles.statusMessage}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.screenHorizontal,
    aspectRatio: ASPECT,
    borderRadius: radius.photoCard,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  outlined: { borderWidth: 1, borderColor: colors.border },
  photoBackdrop: { backgroundColor: colors.surfaceElevated },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  fill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  statusMessage: { ...typography.subheadline, color: colors.textSecondary, textAlign: 'center' },
  emptyMessage: {
    ...typography.subheadline,
    fontFamily: pretendardFor('600'),
    color: colors.textPrimary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  badge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.scrim,
  },
  badgeText: { ...typography.caption, fontFamily: pretendardFor('600'), color: colors.textOnImage },
});
