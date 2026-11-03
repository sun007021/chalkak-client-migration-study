import { ROUTES, feedPath } from '../../app/paths';
import type { PostSeed } from '../post/postModels';
import { feedLocationState, planFeedClose, readFeedSeed } from './feedNavigation';

const ID = '22222222-2222-4222-8222-222222222202';
const SEED: PostSeed = {
  id: ID,
  authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  originalImageUrl: 'https://cdn.example.test/posts/x/original.webp',
  thumbnailImageUrl: 'https://cdn.example.test/posts/x/thumbnail.webp',
  title: '은행잎',
  likeCount: 38,
  isLiked: false,
  isMine: false,
};

describe('상세 진입 state (TC-DISP-055, TC-FEED-001)', () => {
  it('push할 state는 { seed }다', () => {
    expect(feedLocationState(SEED)).toEqual({ seed: SEED });
  });

  it('같은 게시물의 시드는 읽힌다', () => {
    expect(readFeedSeed({ seed: SEED }, ID)).toEqual(SEED);
    expect(readFeedSeed({ seed: SEED }, ID.toUpperCase())).toEqual(SEED);
  });

  it('사인 URL이 있는 시드(전시 목록)도 그대로 읽힌다', () => {
    const withSignature = { ...SEED, signatureOriginalImageUrl: 'https://cdn.example.test/signatures/b/original.png' };
    expect(readFeedSeed({ seed: withSignature }, ID)).toEqual(withSignature);
  });

  it.each([
    ['state 없음', null],
    ['객체가 아닌 state', 'seed'],
    ['seed 없음', {}],
    ['seed가 객체가 아님', { seed: 3 }],
    ['id가 다른 게시물', { seed: { ...SEED, id: '22222222-2222-4222-8222-222222222203' } }],
    ['likeCount 음수', { seed: { ...SEED, likeCount: -1 } }],
    ['likeCount 문자열', { seed: { ...SEED, likeCount: '38' } }],
    ['isLiked 누락', { seed: { ...SEED, isLiked: undefined } }],
    ['originalImageUrl 누락', { seed: { ...SEED, originalImageUrl: undefined } }],
  ])('TC-FEED-001 믿을 수 없는 시드(%s)는 쓰지 않는다 — 시드 없는 진입과 같게 로딩부터', (_label, state) => {
    expect(readFeedSeed(state, ID)).toBeNull();
  });

  it('상세 경로는 /feed/{postId}다', () => {
    expect(feedPath(ID)).toBe(`${ROUTES.feed}/${ID}`);
  });
});

describe('닫기 이동 계획 (REQ-FEED-013, 플랫폼 차이: 웹은 닫기 버튼 + 브라우저 뒤로가기)', () => {
  it('TC-FEED-015 앱 안에서 push한 항목이면 뒤로 간다(이전 화면·스크롤 복원)', () => {
    expect(planFeedClose({ key: 'abc123' })).toEqual({ kind: 'back' });
  });

  it('TC-FEED-015 새로고침·딥링크로 첫 항목이 된 경우(key === "default")에는 홈으로 replace한다', () => {
    expect(planFeedClose({ key: 'default' })).toEqual({ kind: 'replace', to: ROUTES.home });
  });
});
