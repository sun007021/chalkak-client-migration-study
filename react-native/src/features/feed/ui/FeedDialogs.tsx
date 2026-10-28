import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { t } from '../../../shared/copy';
import { colors, spacing } from '../../../shared/ui/theme';
import type { TitleDialogState } from '../FeedState';

function DialogFrame({ testID, children }: { testID: string; children: React.ReactNode }) {
  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <View testID={testID} style={styles.dialog}>
          {children}
        </View>
      </View>
    </Modal>
  );
}

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
    <DialogFrame testID="feed.title-dialog">
      <Text style={styles.title}>{t('feed.edit.title')}</Text>
      <TextInput
        testID="feed.title-input"
        value={dialog.draft}
        onChangeText={onChangeText}
        placeholder={t('feed.edit.placeholder')}
        editable={!dialog.saving}
        autoFocus
        returnKeyType="done"
        style={styles.input}
      />
      {dialog.errorMessage ? <Text style={styles.error}>{dialog.errorMessage}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          testID="feed.title-cancel-button"
          accessibilityRole="button"
          onPress={onCancel}
          disabled={dialog.saving}
          style={styles.action}
        >
          <Text style={styles.cancel}>{t('feed.edit.cancel')}</Text>
        </Pressable>
        <Pressable
          testID="feed.title-save-button"
          accessibilityRole="button"
          onPress={onSave}
          disabled={dialog.saving}
          style={styles.action}
        >
          <Text style={[styles.confirm, dialog.saving && styles.muted]}>
            {dialog.saving ? t('feed.edit.saving') : t('feed.edit.save')}
          </Text>
        </Pressable>
        {dialog.saving ? <ActivityIndicator testID="feed.title-saving" /> : null}
      </View>
    </DialogFrame>
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
    <DialogFrame testID="feed.delete-dialog">
      <Text testID="feed.delete-title" style={styles.title}>
        {t('feed.delete.title')}
      </Text>
      <Text testID="feed.delete-body" style={styles.body}>
        {t('feed.delete.body')}
      </Text>
      <View style={styles.actions}>
        <Pressable
          testID="feed.delete-cancel-button"
          accessibilityRole="button"
          onPress={onCancel}
          style={styles.action}
        >
          <Text style={styles.cancel}>{t('feed.delete.cancel')}</Text>
        </Pressable>
        <Pressable
          testID="feed.delete-confirm-button"
          accessibilityRole="button"
          onPress={onConfirm}
          style={styles.action}
        >
          <Text style={styles.danger}>{t('feed.delete.confirm')}</Text>
        </Pressable>
      </View>
    </DialogFrame>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: 15, color: colors.textSecondary },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
  },
  error: { color: colors.danger, fontSize: 13 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.lg,
  },
  action: { paddingVertical: spacing.xs },
  cancel: { fontSize: 16, color: colors.textSecondary },
  confirm: { fontSize: 16, fontWeight: '700', color: colors.accent },
  danger: { fontSize: 16, fontWeight: '700', color: colors.danger },
  muted: { opacity: 0.5 },
});
