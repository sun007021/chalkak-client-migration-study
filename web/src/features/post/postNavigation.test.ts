import { HOME_BELOW_STATE } from '../../app/paths';
import type { PostSeed } from './postModels';
import { AttachablePostNavigator, RouterPostNavigator } from './postNavigation';
import type { PostDetailNavigator } from './postNavigation';

const SEED: PostSeed = {
  id: '22222222-2222-4222-8222-222222222202',
  authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  originalImageUrl: 'https://cdn.example.test/posts/x/original.webp',
  thumbnailImageUrl: null,
  title: '은행잎',
  likeCount: 38,
  isLiked: false,
  isMine: false,
};

describe('RouterPostNavigator', () => {
  it('TC-DISP-055 /feed/{postId}로 push하고 state는 { seed }다(홈 RouterHomeNavigator와 같은 계약)', () => {
    const calls: { to: string; state: unknown }[] = [];
    new RouterPostNavigator((to, options) => void calls.push({ to, state: options?.state })).openPostDetail({ postId: SEED.id, seed: SEED });
    expect(calls).toEqual([{ to: `/feed/${SEED.id}`, state: { seed: SEED } }]);
    expect(calls[0]!.state).not.toMatchObject(HOME_BELOW_STATE);
  });
});

describe('AttachablePostNavigator', () => {
  const target = { postId: SEED.id, seed: SEED };
  const recorder = () => {
    const calls: unknown[] = [];
    const navigator: PostDetailNavigator = { openPostDetail: (t) => void calls.push(t) };
    return { calls, navigator };
  };

  it('붙어 있는 동안만 전달하고 붙어 있지 않을 때의 요청은 버린다', () => {
    const nav = new AttachablePostNavigator();
    const { calls, navigator } = recorder();
    nav.openPostDetail(target);
    const detach = nav.attach(navigator);
    nav.openPostDetail(target);
    detach();
    nav.openPostDetail(target);
    expect(calls).toEqual([target]);
  });

  it('그 사이 다른 구현이 붙었으면 이전 detach는 새 구현을 떼지 않는다', () => {
    const nav = new AttachablePostNavigator();
    const first = recorder();
    const second = recorder();
    const detachFirst = nav.attach(first.navigator);
    nav.attach(second.navigator);
    detachFirst();
    nav.openPostDetail(target);
    expect(first.calls).toEqual([]);
    expect(second.calls).toEqual([target]);
  });
});
