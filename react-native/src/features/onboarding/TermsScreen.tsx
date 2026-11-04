import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import type { TermsViewModel } from './TermsViewModel';
import { colors, radius, spacing, typography } from '../../shared/design/tokens';
import { BackButton } from '../../shared/ui/BackButton';
import { ChalkakButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/icons/Icon';
import { Text } from '../../shared/ui/Text';

// 전체 동의 카드 테두리(원본 하드코딩 #E3E1DD, screens-a.md §5.1).
const ALL_CONSENT_BORDER = '#E3E1DD';

// 제목의 첫 줄만 testID 요소에 두고 나머지는 다음 줄 요소에 둔다(테스트가 첫 줄 문구로 조회한다).
const firstLine = (text: string): string => text.split('\n')[0];
const otherLines = (text: string): string => text.split('\n').slice(1).join('\n');

type CheckRowProps = {
  testID: string;
  label: string;
  checked: boolean;
  onPress: () => void;
  viewTestID?: string;
  onView?: () => void;
};

// 원본 약관 동의(screens-a.md §5): 배경 inputBackground, 가로 25, 필수 행 체크박스 + 제목(body, textPrimary 85%) 간격 14,
// "보기"(callout textMuted), 행 아래 1px border 구분선. "다음"은 동의 전에는 비활성(actionPrimary 12%).
function RequiredRow({ testID, label, checked, onPress, viewTestID, onView }: CheckRowProps) {
  return (
    <>
      <View style={styles.requiredRow}>
        <Pressable
          testID={testID}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          onPress={onPress}
          style={styles.requiredCheck}
        >
          <Icon name={checked ? 'ic_checkbox_selected' : 'ic_checkbox_unselected'} size={22} />
          <Text style={styles.requiredLabel}>{label}</Text>
        </Pressable>
        {viewTestID ? (
          <Pressable
            testID={viewTestID}
            accessibilityRole="button"
            onPress={onView}
            style={styles.view}
          >
            <Text style={styles.viewText}>{t('onb.terms.view')}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.divider} />
    </>
  );
}

/** testID는 testids.md의 terms.*. 상태는 구독만 하고 수명주기는 SignUpFlowViewModel이 가진다. */
export function TermsScreen({ viewModel }: { viewModel: TermsViewModel }) {
  const { service, privacy, allAgreed, canProceed } = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="terms.root"
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}
    >
      <View style={styles.backRow}>
        <BackButton testID="terms.back-button" onPress={() => viewModel.back()} />
      </View>
      <View style={styles.titleBox}>
        <Text testID="terms.title" style={styles.title}>
          {firstLine(t('onb.terms.title'))}
        </Text>
        <Text style={styles.title}>{otherLines(t('onb.terms.title'))}</Text>
      </View>
      <View style={styles.body}>
        <Pressable
          testID="terms.agree-all-checkbox"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allAgreed }}
          onPress={() => viewModel.toggleAll()}
          style={styles.allRow}
        >
          <Icon name={allAgreed ? 'ic_checkbox_selected' : 'ic_checkbox_unselected'} size={22} />
          <Text style={styles.allLabel}>{t('onb.terms.agree-all')}</Text>
        </Pressable>
        <View style={styles.requiredGroup}>
          <RequiredRow
            testID="terms.service-checkbox"
            label={t('onb.terms.service')}
            checked={service}
            onPress={() => viewModel.toggleService()}
            viewTestID="terms.service-view-button"
            onView={() => viewModel.openDocument('service')}
          />
          <RequiredRow
            testID="terms.privacy-checkbox"
            label={t('onb.terms.privacy')}
            checked={privacy}
            onPress={() => viewModel.togglePrivacy()}
            viewTestID="terms.privacy-view-button"
            onView={() => viewModel.openDocument('privacy')}
          />
        </View>
      </View>
      <ChalkakButton
        testID="terms.next-button"
        label={t('onb.terms.next')}
        disabled={!canProceed}
        onPress={() => viewModel.next()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.screenHorizontal,
  },
  backRow: { marginLeft: -12, height: 50, justifyContent: 'center' },
  titleBox: {},
  title: { ...typography.title1, color: colors.textPrimary },
  body: { flex: 1, marginTop: 57 },
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 19,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: ALL_CONSENT_BORDER,
    backgroundColor: colors.inputBackground,
  },
  allLabel: { ...typography.body, color: colors.textPrimary },
  requiredGroup: { marginTop: 3 },
  requiredRow: { flexDirection: 'row', alignItems: 'center' },
  requiredCheck: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingLeft: spacing.xs,
    paddingVertical: spacing.lg,
  },
  requiredLabel: { ...typography.body, color: 'rgba(43,39,36,0.85)' },
  view: { paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: spacing.lg },
  viewText: { ...typography.callout, color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border },
});
