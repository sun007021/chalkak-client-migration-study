import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import type { TermsViewModel } from './TermsViewModel';

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
  bold?: boolean;
};

function CheckRow({ testID, label, checked, onPress, viewTestID, onView, bold }: CheckRowProps) {
  return (
    <View style={styles.row}>
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={onPress}
        style={styles.check}
      >
        <View style={[styles.box, checked && styles.boxOn]}>
          {checked ? <Text style={styles.tick}>✓</Text> : null}
        </View>
        <Text style={[styles.label, bold && styles.labelBold]}>{label}</Text>
      </Pressable>
      {viewTestID ? (
        <Pressable
          testID={viewTestID}
          accessibilityRole="button"
          onPress={onView}
          hitSlop={8}
          style={styles.view}
        >
          <Text style={styles.viewText}>{t('onb.terms.view')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** testID는 testids.md의 terms.*. 상태는 구독만 하고 수명주기는 SignUpFlowViewModel이 가진다. */
export function TermsScreen({ viewModel }: { viewModel: TermsViewModel }) {
  const { service, privacy, allAgreed, canProceed } = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="terms.root"
      style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
    >
      <Pressable
        testID="terms.back-button"
        accessibilityRole="button"
        onPress={() => viewModel.back()}
        hitSlop={12}
        style={styles.back}
      >
        <Text style={styles.backText}>‹</Text>
      </Pressable>
      <View style={styles.titleBox}>
        <Text testID="terms.title" style={styles.title}>
          {firstLine(t('onb.terms.title'))}
        </Text>
        <Text style={styles.title}>{otherLines(t('onb.terms.title'))}</Text>
      </View>
      <View style={styles.body}>
        <CheckRow
          testID="terms.agree-all-checkbox"
          label={t('onb.terms.agree-all')}
          checked={allAgreed}
          onPress={() => viewModel.toggleAll()}
          bold
        />
        <View style={styles.divider} />
        <CheckRow
          testID="terms.service-checkbox"
          label={t('onb.terms.service')}
          checked={service}
          onPress={() => viewModel.toggleService()}
          viewTestID="terms.service-view-button"
          onView={() => viewModel.openDocument('service')}
        />
        <CheckRow
          testID="terms.privacy-checkbox"
          label={t('onb.terms.privacy')}
          checked={privacy}
          onPress={() => viewModel.togglePrivacy()}
          viewTestID="terms.privacy-view-button"
          onView={() => viewModel.openDocument('privacy')}
        />
      </View>
      <Pressable
        testID="terms.next-button"
        accessibilityRole="button"
        disabled={!canProceed}
        onPress={() => viewModel.next()}
        style={[styles.next, !canProceed && styles.nextOff]}
      >
        <Text style={styles.nextText}>{t('onb.terms.next')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 24 },
  back: { width: 44, height: 44, justifyContent: 'center' },
  backText: { fontSize: 32, color: '#111111' },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 38, color: '#111111' },
  body: { flex: 1, marginTop: 48 },
  titleBox: { marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52 },
  check: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, height: 52 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#BBBBBB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: '#111111', borderColor: '#111111' },
  tick: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  label: { fontSize: 15, color: '#222222' },
  labelBold: { fontSize: 16, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#DDDDDD', marginVertical: 8 },
  view: { paddingHorizontal: 4, height: 44, justifyContent: 'center' },
  viewText: { fontSize: 13, color: '#777777', textDecorationLine: 'underline' },
  next: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
  nextOff: { backgroundColor: '#CCCCCC' },
  nextText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
