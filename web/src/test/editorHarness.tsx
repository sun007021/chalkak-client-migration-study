import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { createPhotoEditor } from '../features/upload/editor/PhotoEditorScreen';
import { PhotoEditorViewModel } from '../features/upload/editor/PhotoEditorViewModel';
import type { PhotoEditorDeps } from '../features/upload/editor/PhotoEditorViewModel';
import { IDENTITY_EDIT } from '../features/upload/editModel';
import type { PhotoEdit } from '../features/upload/editModel';
import { flushAsync } from './FakeClock';
import { FakeAutoAnalyzer } from './FakeAutoAnalyzer';
import { FakeImageDecoder, imageFile } from './FakeImageDecoder';
import { FakePreviewRenderer } from './FakePreviewRenderer';

/** 대기 중인 Promise 체인을 충분히 비운다(가짜 시계는 움직이지 않는다). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await flushAsync();
}

/** 편집기에 쓰는 Fake 묶음. 사진 기본 4000×3000. */
export function editorFakes() {
  return { decoder: new FakeImageDecoder(), preview: new FakePreviewRenderer(), analyzer: new FakeAutoAnalyzer() };
}

export type EditorFakes = ReturnType<typeof editorFakes>;

/** ViewModel 단위 테스트용. start()는 호출하지 않는다. */
export function createEditorVm(options: { fakes?: EditorFakes; source?: Blob; initialEdit?: PhotoEdit; photo?: Parameters<typeof imageFile>[0] } = {}) {
  const fakes = options.fakes ?? editorFakes();
  const source = options.source ?? imageFile(options.photo);
  const confirmed: PhotoEdit[] = [];
  const cancels = { count: 0 };
  const deps: PhotoEditorDeps = {
    source,
    initialEdit: options.initialEdit ?? IDENTITY_EDIT,
    decoder: fakes.decoder,
    preview: fakes.preview,
    analyzer: fakes.analyzer,
    onConfirm: (edit) => confirmed.push(edit),
    onCancel: () => {
      cancels.count += 1;
    },
  };
  const vm = new PhotoEditorViewModel(deps);
  return { vm, fakes, source, confirmed, cancels };
}

/** 열고(start) 첫 미리보기까지 기다린다. */
export async function openEditorVm(options: Parameters<typeof createEditorVm>[0] = {}) {
  const ctx = createEditorVm(options);
  ctx.vm.start();
  await settle();
  return ctx;
}

/** 화면 테스트용: 실제 createPhotoEditor 컴포넌트를 그린다. */
export function renderEditor(options: { fakes?: EditorFakes; source?: Blob; initialEdit?: PhotoEdit; photo?: Parameters<typeof imageFile>[0]; strict?: boolean } = {}) {
  const fakes = options.fakes ?? editorFakes();
  const source = options.source ?? imageFile(options.photo);
  const Editor = createPhotoEditor({ decoder: fakes.decoder, preview: fakes.preview, analyzer: fakes.analyzer });
  const confirmed: PhotoEdit[] = [];
  const cancels = { count: 0 };
  const editor = (
    <Editor
      source={source}
      initialEdit={options.initialEdit ?? IDENTITY_EDIT}
      onConfirm={(edit) => confirmed.push(edit)}
      onCancel={() => {
        cancels.count += 1;
      }}
    />
  );
  const view = render(options.strict ? <StrictMode>{editor}</StrictMode> : editor);
  return { fakes, source, confirmed, cancels, ...view };
}
