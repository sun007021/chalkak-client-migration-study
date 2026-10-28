import { picked } from '../../../core/media/__testing__/FakeImagePicker';
import type { PhotoEdit } from '../../photo-edit/PhotoEdit';
import { flush, PHOTO_URI, type UploadHarness } from './createUploadHarness';

/**
 * 앨범에서 사진을 고르고 편집기를 열어 (선택적으로 편집을 바꾼 뒤) "완료"까지 진행한다.
 * [가정: 편집기의 start()는 화면(또는 테스트)이 부른다. start는 여러 번 불러도 한 번만 일어난다.]
 */
export async function pickAndConfirm(
  h: UploadHarness,
  uri = PHOTO_URI,
  tweak?: (editor: NonNullable<UploadHarness['viewModel']['editor']>) => void,
): Promise<void> {
  h.picker.willPick(picked(uri));
  await h.viewModel.pickFromLibrary();
  const editor = h.viewModel.editor;
  if (!editor) throw new Error('편집기가 열리지 않았다');
  await editor.start();
  tweak?.(editor);
  await editor.done();
  await flush();
}

/** 최종 요청에 실린 편집값(마지막 인코딩 요청). */
export const lastEncodedEdit = (h: UploadHarness): PhotoEdit | null | undefined =>
  h.engine.encodeRequests.at(-1)?.edit;
