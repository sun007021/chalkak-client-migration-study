import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BannerFeedState } from '../../banner/BannerFeedViewModel';
import { t } from '../../../shared/copy';
import { colors, spacing } from '../../../shared/ui/theme';

type Props = {
  feed: Readonly<BannerFeedState>;
  onBannerPress: (bannerId: string) => void;
  onRetry: () => void;
  /** 섹션이 스크롤 내용 안에서 놓인 세로 위치와 각 카드의 섹션 안 위치(마지막으로 보이는 카드 계산용). */
  onSectionLayout: (y: number) => void;
  onCardLayout: (index: number, y: number) => void;
};

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
  if (feed.status === 'loading') return <ActivityIndicator style={styles.loading} />;
  if (feed.status === 'error') {
    return (
      <View style={styles.error}>
        <Text testID="home.issue-error" style={styles.errorText}>
          {t('home.banner.error')}
        </Text>
        <Pressable testID="home.issue-retry-button" accessibilityRole="button" onPress={onRetry}>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </Pressable>
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
      <Text style={styles.title}>{t('home.banner.title')}</Text>
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
          {banner.thumbnailUrl ? (
            <Image source={{ uri: banner.thumbnailUrl }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={styles.thumb} />
          )}
          <View style={styles.texts}>
            <Text style={styles.cardTitle}>{banner.title}</Text>
            <Text style={styles.cardSubtitle}>{banner.subtitle}</Text>
          </View>
        </Pressable>
      ))}
      {feed.loadingMore ? <ActivityIndicator style={styles.loading} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.md },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  card: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: colors.surface },
  texts: { flex: 1, gap: spacing.xs },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  cardSubtitle: { fontSize: 13, color: colors.textSecondary },
  loading: { padding: spacing.lg },
  error: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.xs },
  errorText: { color: colors.textSecondary },
  retryText: { color: colors.accent, fontWeight: '600' },
});
