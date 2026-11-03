import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { useDialogFocus } from './useDialogFocus';

function Dialog() {
  const ref = useRef<HTMLDivElement | null>(null);
  useDialogFocus(ref);
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <button data-testid="first">첫째</button>
      <button data-testid="last">끝</button>
      <div inert>
        <button data-testid="blocked">막힘</button>
      </div>
    </div>
  );
}

describe('코드 리뷰 15: 초점 가능 목록은 inert 안의 요소를 건너뛴다', () => {
  it('inert 안의 버튼이 마지막이어도 Tab 순환의 끝은 마지막 실제 버튼이다', () => {
    const { getByTestId } = render(<Dialog />);
    getByTestId('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(getByTestId('first'));
  });

  it('처음 초점은 inert 안이 아닌 첫 요소로 간다', () => {
    const { getByTestId } = render(<Dialog />);
    expect(document.activeElement).toBe(getByTestId('first'));
  });
});
