import type { ReactNode } from 'react';
import type { ImageDecoder } from '../imagePorts';
import type { PhotoEditorComponent, PhotoEditorProps } from '../photoEditor';
import type { AutoAnalyzer, PreviewRenderer } from './editorPorts';

export interface PhotoEditorScreenDeps {
  decoder: ImageDecoder;
  preview: PreviewRenderer;
  analyzer: AutoAnalyzer;
}

/**
 * 사진 편집기 화면(업로드 화면 위 전체 화면 모달, 내비게이션 목적지 아님). 마운트마다 PhotoEditorViewModel을 만들어 start()하고 언마운트에서 dispose한다
 * (StrictMode 이중 마운트에서도 디코드는 마운트된 인스턴스당 한 번). screen_view는 보내지 않는다.
 *
 * 접근성: 루트 `photo-edit.root`는 role="dialog" aria-modal="true"이고 useDialogFocus(Esc = "취소", 처리 중에는 Esc 무시)로 포커스를 가둔다.
 * 닫히면 열기 전 포커스(미리보기/사진 선택 트리거)로 돌아간다.
 *
 * testid(testids.md photo-edit 행만):
 * - `photo-edit.cancel-button`, `photo-edit.done-button`("완료"; phase가 ready가 아니거나 confirming이면 disabled). 문구는 edit.top.*.
 * - 탭 `photo-edit.tab-crop|tab-adjust|tab-filter`(role="tab", aria-selected). 처음 선택은 자르기. 문구 edit.tab.*.
 * - `photo-edit.preview-image`: <img src=state.preview.src alt="">, 미리보기가 생긴 뒤에만 있다.
 * - 자르기 탭: `photo-edit.crop-area`(미리보기 사진이 보이는 상자를 덮는 포인터 대상, data-center-x/-center-y/-width/-height에 cropRect를 소수 넷째 자리까지, 자식으로
 *   모서리 손잡이 `[data-handle="top-left|top-right|bottom-left|bottom-right"]` 4개와 영역 이동 `[data-handle="move"]`, 3×3 격자선 `[data-grid-line]` 4개),
 *   `photo-edit.rotate-button`, `photo-edit.reset-button`, 비율 `photo-edit.ratio-original|free|1-1|4-5|5-4|3-4|4-3|9-16|16-9`(role="radio" aria-checked, 9개를 이 순서로, role="radiogroup" 안).
 *   손잡이 pointerdown(시작 지점·시작 영역 기억) → pointermove(buttons≠0이면 crop-area의 getBoundingClientRect 크기로 delta를 비율로 바꿔 dragRect → vm.setCropRect) → pointerup/cancel.
 * - 조정 탭: 항목 줄 `photo-edit.adjust-item-auto|exposure|contrast|highlights|shadows|black-point|saturation|warmth`(role="tab", aria-selected, 이 순서),
 *   선택된 항목의 슬라이더 하나만: `photo-edit.adjust-<exposure|contrast|highlights|shadows|black-point|saturation|warmth>-slider` = <input type="range" min=-100 max=100 step=1>,
 *   value·aria-valuetext는 표시값(정수), aria-label은 항목 문구, onKeyDown: ←/↓ -1, →/↑ +1, PageDown -10, PageUp +10, Home -100, End +100(기본 동작은 막음).
 *   'auto' 선택 시: `photo-edit.adjust-auto-toggle`(role="switch", aria-checked = 강도 > 0), `photo-edit.adjust-auto-strength-slider`(range 0~1 step 0.01).
 *   `photo-edit.adjust-reset-button`("초기화", edit.adjust.reset)은 조정 탭에서 항상 보인다.
 * - 필터 탭: `photo-edit.filter-original|mono|warm|cool|vintage|vivid`(role="radio" aria-checked, 이 순서, role="radiogroup" 안, 안에 썸네일 <img>와 문구).
 * - `photo-edit.rendering-indicator`(role="status", confirming 동안만), `photo-edit.error-dialog`(role="alertdialog", 문구 edit.error.render) 안의 `photo-edit.error-retry-button`(열리면 포커스가 여기로). 오류 알림이 열려 있는 동안 완료는 비활성이다.
 */
export function PhotoEditorScreen(_props: PhotoEditorProps & { deps: PhotoEditorScreenDeps }): ReactNode {
  throw new Error('not implemented');
}

/** 컨테이너가 photoEditor로 꽂는 컴포넌트를 만든다. */
export function createPhotoEditor(_deps: PhotoEditorScreenDeps): PhotoEditorComponent {
  throw new Error('not implemented');
}
