import { StyleSheet, View } from 'react-native';

import { formatTodayTopicLabel } from '../../../core/time/dateFormat';
import { t } from '../../../shared/copy';
import { colors, spacing, typography } from '../../../shared/design/tokens';
import { RoundIconButton } from '../../../shared/ui/RoundIconButton';
import { Text } from '../../../shared/ui/Text';
import type { TopicSection } from '../HomeState';

type Props = { topic: TopicSection; onRetry: () => void };

/** 오늘 주제 머리글(screens-a.md §7.3). 날짜 라벨 subheadline, 주제명 title2. 로딩·404·실패는 제목 자리에 문구 하나만 보인다. */
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
        <View style={styles.retry}>
          <RoundIconButton
            testID="home.retry-button"
            accessibilityLabel={t('common.retry')}
            size={32}
            iconSize={15}
            onPress={onRetry}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: spacing.screenHorizontal, gap: spacing.sm },
  date: { ...typography.subheadline, color: colors.textPrimary },
  title: { ...typography.title2, color: colors.textPrimary },
  muted: { color: colors.textMuted },
  retry: { alignSelf: 'flex-start', marginTop: spacing.xs },
});
