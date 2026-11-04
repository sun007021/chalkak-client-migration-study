import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import { Dialog, DialogButton } from '../../shared/ui/Dialog';
import type { UpdateDialogViewModel } from './UpdateDialogViewModel';

/**
 * 닫을 수 없는 강제 업데이트 다이얼로그. testID update-gate.*.
 * onRequestClose(안드로이드 뒤로가기)는 아무것도 하지 않고, 바깥 영역에는 닫기 동작이 없다.
 * Android 계열에만 "취소"(앱 종료) 버튼이 있다. 모양은 공통 다이얼로그(docs/design/screens-b.md §1.6).
 */
export function UpdateGateDialog({ viewModel }: { viewModel: UpdateDialogViewModel }) {
  const { opening } = useViewModelState(viewModel);
  return (
    <Dialog
      testID="update-gate.dialog"
      titleTestID="update-gate.title"
      messageTestID="update-gate.message"
      title={t('boot.update.title')}
      message={t('boot.update.body')}
      onRequestClose={noop}
      actions={
        <>
          {viewModel.canCancel && (
            <DialogButton
              testID="update-gate.cancel-button"
              tone="cancel"
              label={t('boot.update.cancel')}
              onPress={() => viewModel.onCancelPress()}
            />
          )}
          <DialogButton
            testID="update-gate.update-button"
            label={t('boot.update.button')}
            disabled={opening}
            onPress={() => void viewModel.onUpdatePress()}
          />
        </>
      }
    />
  );
}

function noop(): void {}
