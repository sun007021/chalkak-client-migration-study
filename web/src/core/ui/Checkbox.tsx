import type { ReactNode } from 'react';
import { IcCheckboxSelected, IcCheckboxUnselected } from './icons.generated';

/** 원본 ChalkakCheckbox: 22×22, 원본 색 아이콘(ic_checkbox_*), 애니메이션 없이 즉시 교체. */
export function CheckboxIcon({ checked }: { checked: boolean }): ReactNode {
  return checked ? <IcCheckboxSelected size={22} /> : <IcCheckboxUnselected size={22} />;
}
