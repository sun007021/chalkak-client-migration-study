import type { CSSProperties, ReactNode } from 'react';
import { webOnlyCopy } from '../../copy/webOnly';

const buttonStyle: CSSProperties = { border: 0, padding: 4, background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer' };

/**
 * 하트 버튼과 개수. 눌림 상태는 aria-pressed(isLiked), 접근성 이름은 "좋아요 N개"(TC-LIKE-034), 개수는 별도 요소(testid의 *.like-count*)다.
 * 버튼 id와 개수 id는 호출한 화면이 정한다(testid 규칙). disabled여도 개수는 그대로 보인다.
 */
export function LikeButton({
  buttonTestId,
  countTestId,
  isLiked,
  likeCount,
  disabled = false,
  onPress,
}: {
  buttonTestId: string;
  countTestId: string;
  isLiked: boolean;
  likeCount: number;
  disabled?: boolean;
  onPress: () => void;
}): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <button
        type="button"
        data-testid={buttonTestId}
        aria-pressed={isLiked}
        aria-label={webOnlyCopy['like.a11y'].replace('{n}', String(likeCount))}
        disabled={disabled}
        style={buttonStyle}
        onClick={onPress}
      >
        <span aria-hidden="true">{isLiked ? '♥' : '♡'}</span>
      </button>
      <span data-testid={countTestId} aria-hidden="true">{likeCount}</span>
    </span>
  );
}
