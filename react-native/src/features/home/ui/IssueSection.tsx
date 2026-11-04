import { Pressable, StyleSheet, View } from 'react-native';

import type { BannerFeedState } from '../../banner/BannerFeedViewModel';
import { t } from '../../../shared/copy';
import { colors, pretendardFor, radius, spacing, typography } from '../../../shared/design/tokens';
import { RemoteImage } from '../../../shared/ui/RemoteImage';
import { RoundIconButton } from '../../../shared/ui/RoundIconButton';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { Text } from '../../../shared/ui/Text';

type Props = {
  feed: Readonly<BannerFeedState>;
  onBannerPress: (bannerId: string) => void;
  onRetry: () => void;
  /** 섹션이 스크롤 내용 안에서 놓인 세로 위치와 각 카드의 섹션 안 위치(마지막으로 보이는 카드 계산용). */
  onSectionLayout: (y: number) => void;
  onCardLayout: (index: number, y: number) => void;
};

// 원본 HomeIssueSection(screens-a.md §7.8): 헤더 "ISSUE"(headline bold) 아래 16, 카드 = 이미지(1672:941, 라운드 large 16)
// + 제목 subheadline bold + 부제 caption textSecondary, 카드 간격 40.
const IMAGE_ASPECT = 1672 / 941;

/**
 * ISSUE 섹션. 배너가 0건이면 섹션 전체를 그리지 않고, 최초 조회 실패는 섹션 대신 오류 문구와 다시 시도를 그린다.
 * 카드는 바깥 ScrollView 안에 그대로 쌓고, 위치만 알린다(어느 카드가 보이는지는 HomeScreen이 스크롤 위치로 계산한다).
 */
export function IssueSection({
  feed,
  onBannerPress,
  onRetry,
  onSectionLayout,
  onCardLayout,
}: Props) {
  if (feed.status === 'loading') {
    return (
      <View style={styles.root} accessible accessibilityLabel="배너 불러오는 중">
        <Text style={styles.title}>{t('home.banner.title')}</Text>
        <Skeleton style={styles.image} />
      </View>
    );
  }
  if (feed.status === 'error') {
    return (
      <View style={styles.error}>
        <Text testID="home.issue-error" style={styles.errorText}>
          {t('home.banner.error')}
        </Text>
        <RoundIconButton
          testID="home.issue-retry-button"
          accessibilityLabel={t('common.retry')}
          size={32}
          iconSize={15}
          onPress={onRetry}
        />
      </View>
    );
  }
  if (feed.banners.length === 0) return null;
  return (
    <View
      testID="home.issue-section"
      style={styles.root}
      onLayout={(e) => onSectionLayout(e.nativeEvent.layout.y)}
    >
      <Text accessibilityRole="header" style={styles.title}>
        {t('home.banner.title')}
      </Text>
      {feed.banners.map((banner, index) => (
        <Pressable
          key={banner.id}
          testID={`home.issue-item-${banner.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${banner.title}, ${banner.subtitle}`}
          onPress={() => onBannerPress(banner.id)}
          onLayout={(e) => onCardLayout(index, e.nativeEvent.layout.y)}
          style={styles.card}
        >
          <RemoteImage uri={banner.thumbnailUrl} style={styles.image} />
          <View style={styles.texts}>
            <Text style={styles.cardTitle}>{banner.title}</Text>
            <Text style={styles.cardSubtitle}>{banner.subtitle}</Text>
          </View>
        </Pressable>
      ))}
      {feed.loadingMore ? <Skeleton style={styles.image} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: spacing.screenHorizontal, gap: spacing.lg },
  title: { ...typography.headline, fontFamily: pretendardFor('700'), color: colors.textPrimary },
  card: { gap: spacing.lg, marginBottom: spacing.xxl - spacing.lg },
  image: {
    aspectRatio: IMAGE_ASPECT,
    borderRadius: radius.large,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  texts: { gap: spacing.sm },
  cardTitle: {
    ...typography.subheadline,
    fontFamily: pretendardFor('700'),
    color: colors.textPrimary,
  },
  cardSubtitle: { ...typography.caption, color: colors.textSecondary },
  error: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.screenHorizontal,
  },
  errorText: { ...typography.subheadline, color: colors.textSecondary },
});
