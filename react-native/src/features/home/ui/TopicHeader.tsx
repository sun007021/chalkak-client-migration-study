import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatTodayTopicLabel } from '../../../core/time/dateFormat';
import { t } from '../../../shared/copy';
import { colors, spacing } from '../../../shared/ui/theme';
import type { TopicSection } from '../HomeState';

type Props = { topic: TopicSection; onRetry: () => void };

/** 오늘 주제 머리글. 날짜 라벨은 주제가 있을 때만, 로딩·404·실패는 제목 자리에 문구 하나만 보인다. */
export function TopicHeader({ topic, onRetry }: Props) {
  if (topic.status === 'ready' && topic.topic) {
    return (
      <View style={styles.root}>
        <Text testID="home.topic-date" style={styles.date}>
          {formatTodayTopicLabel(topic.topic.topicDate)}
        </Text>
        <Text testID="home.topic-title" style={styles.title}>
          {topic.topic.title}
        </Text>
      </View>
    );
  }
  const message =
    topic.status === 'loading'
      ? t('home.topic.loading')
      : topic.status === 'error'
        ? t('home.topic.error')
        : t('home.topic.not-ready');
  return (
    <View style={styles.root}>
      <Text testID="home.topic-title" style={[styles.title, styles.muted]}>
        {message}
      </Text>
      {topic.status === 'error' ? (
        <Pressable
          testID="home.retry-button"
          accessibilityRole="button"
          onPress={onRetry}
          style={styles.retry}
        >
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  date: { fontSize: 13, color: colors.textSecondary },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  muted: { color: colors.textSecondary, fontSize: 16, fontWeight: '500' },
  retry: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  retryText: { color: colors.accent, fontWeight: '600' },
});
