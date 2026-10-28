import type { ComponentType } from 'react';
import type { PhotoEdit } from './editModel';

export interface PhotoEditorProps {
  /** 편집할 원본 사진(EXIF 방향은 편집기가 디코더로 반영한다). */
  source: Blob;
  /** 처음 고른 사진이면 IDENTITY_EDIT, 다시 편집이면 확정해 둔 편집값. */
  initialEdit: PhotoEdit;
  /** "완료": 확정한 편집값. */
  onConfirm(edit: PhotoEdit): void;
  /** "취소": 이번 편집의 모든 변경을 버린다. */
  onCancel(): void;
}

/** 편집기 화면 컴포넌트(W7b). 컨테이너가 null이면 편집기가 없는 것이고, 업로드 화면은 고른 사진을 편집하지 않은 값으로 바로 확정한다. */
export type PhotoEditorComponent = ComponentType<PhotoEditorProps>;
