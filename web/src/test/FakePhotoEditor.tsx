import { useEffect } from 'react';
import { IDENTITY_EDIT } from '../features/upload/editModel';
import type { PhotoEdit } from '../features/upload/editModel';
import type { PhotoEditorComponent, PhotoEditorProps } from '../features/upload/photoEditor';

/**
 * 편집기 본체(W7b) 대신 연결점만 확인하는 Fake 편집기. 문서화된 photo-edit.* testid를 쓴다:
 * photo-edit.root, photo-edit.done-button(confirmWith를 확정), photo-edit.cancel-button.
 */
export function createFakePhotoEditor(initial: PhotoEdit = IDENTITY_EDIT) {
  const probe = {
    /** 편집기가 마운트될 때 받은 props 기록. */
    opens: [] as PhotoEditorProps[],
    /** "완료"가 확정할 편집값. */
    confirmWith: initial,
  };
  const Component: PhotoEditorComponent = (props) => {
    useEffect(() => {
      probe.opens.push(props);
      // 마운트당 한 번만 기록한다(props 참조는 렌더마다 바뀔 수 있다).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div data-testid="photo-edit.root">
        <button type="button" data-testid="photo-edit.done-button" onClick={() => props.onConfirm(probe.confirmWith)}>
          완료
        </button>
        <button type="button" data-testid="photo-edit.cancel-button" onClick={() => props.onCancel()}>
          취소
        </button>
      </div>
    );
  };
  return { Component, probe };
}
