import { StyleSheet, View } from 'react-native';

import { t } from '../../../shared/copy';
import { colors, spacing, typography } from '../../../shared/design/tokens';
import { Dialog, DialogButton } from '../../../shared/ui/Dialog';
import { Text } from '../../../shared/ui/Text';
import { TextField } from '../../../shared/ui/TextField';
import type { TitleDialogState } from '../FeedState';

/** 제목 최대 길이(code point). 입력 제한 자체는 ViewModel이 건다. 카운터 표시용(screens-b.md §4.4). */
const TITLE_MAX = 10;

/** 제목 수정 다이얼로그(원본 FeedTitleEditDialog): 공통 다이얼로그 + ChalkakTextField, 버튼 "취소"(회색) / "저장". */
export function TitleDialog({
  dialog,
  onChangeText,
  onSave,
  onCancel,
}: {
  dialog: TitleDialogState;
  onChangeText: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      testID="feed.title-dialog"
      title={t('feed.edit.title')}
      onRequestClose={onCancel}
      actions={
        <>
          <DialogButton
            testID="feed.title-cancel-button"
            tone="cancel"
            label={t('feed.edit.cancel')}
            disabled={dialog.saving}
            onPress={onCancel}
          />
          <DialogButton
            testID="feed.title-save-button"
            label={dialog.saving ? t('feed.edit.saving') : t('feed.edit.save')}
            disabled={dialog.saving}
            busy={dialog.saving}
            busyTestID="feed.title-saving"
            onPress={onSave}
          />
        </>
      }
    >
      <View style={styles.field}>
        <TextField
          testID="feed.title-input"
          value={dialog.draft}
          onChangeText={onChangeText}
          placeholder={t('feed.edit.placeholder')}
          editable={!dialog.saving}
          autoFocus
          returnKeyType="done"
          style={styles.input}
          counterText={`${Array.from(dialog.draft).length} / ${TITLE_MAX}`}
        />
      </View>
      {dialog.errorMessage ? <Text style={styles.error}>{dialog.errorMessage}</Text> : null}
    </Dialog>
  );
}

export function DeleteDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      testID="feed.delete-dialog"
      titleTestID="feed.delete-title"
      messageTestID="feed.delete-body"
      title={t('feed.delete.title')}
      message={t('feed.delete.body')}
      onRequestClose={onCancel}
      actions={
        <>
          <DialogButton
            testID="feed.delete-cancel-button"
            tone="cancel"
            label={t('feed.delete.cancel')}
            onPress={onCancel}
          />
          <DialogButton
            testID="feed.delete-confirm-button"
            tone="destructive"
            label={t('feed.delete.confirm')}
            onPress={onConfirm}
          />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  field: { alignSelf: 'stretch', marginTop: spacing.lg },
  input: { ...typography.subheadline },
  error: {
    ...typography.footnote,
    marginTop: spacing.md,
    color: colors.error,
    textAlign: 'center',
  },
});
