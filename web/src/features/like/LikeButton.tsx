import type { CSSProperties, ReactNode } from 'react';
import { webOnlyCopy } from '../../copy/webOnly';
import { color, font } from '../../design/tokens';
import { IcHeart, IcHeartFilled } from '../../core/ui/icons.generated';

const buttonStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, minHeight: 32, border: 0, padding: 4, background: 'none', color: 'inherit', cursor: 'pointer', lineHeight: 0 };

/**
 * 하트 버튼과 개수(원본 TodayPhotoCard 액션 행: 하트 24, 좋아요 actionPrimary / 아니면 textSecondary, 개수 body textSecondary).
 * 눌림 상태는 aria-pressed(isLiked), 접근성 이름은 "좋아요 N개"(TC-LIKE-034), 개수는 별도 요소(testid의 *.like-count*)다.
 * 버튼 id와 개수 id는 호출한 화면이 정한다(testid 규칙). disabled여도 개수는 그대로 보인다.
 * tone="onImage"는 사진 위(전시 그리드): textOnImage + 옅은 그림자.
 */
export function LikeButton({
  buttonTestId,
  countTestId,
  isLiked,
  likeCount,
  disabled = false,
  size = 24,
  tone = 'default',
  onPress,
}: {
  buttonTestId: string;
  countTestId: string;
  isLiked: boolean;
  likeCount: number;
  disabled?: boolean;
  size?: number;
  tone?: 'default' | 'onImage';
  onPress: () => void;
}): ReactNode {
  const onImage = tone === 'onImage';
  const tint = onImage ? color.textOnImage : isLiked ? color.actionPrimary : color.textSecondary;
  const shadow = onImage ? 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25))' : undefined;
  const Heart = isLiked ? IcHeartFilled : IcHeart;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: tint, filter: shadow }}>
      <button
        type="button"
        className="ck-press"
        data-testid={buttonTestId}
        aria-pressed={isLiked}
        aria-label={webOnlyCopy['like.a11y'].replace('{n}', String(likeCount))}
        disabled={disabled}
        style={buttonStyle}
        onClick={onPress}
      >
        <Heart size={size} />
      </button>
      <span data-testid={countTestId} aria-hidden="true" style={{ ...font(size <= 18 ? 'subheadline' : 'body'), color: tint }}>{likeCount}</span>
    </span>
  );
}
