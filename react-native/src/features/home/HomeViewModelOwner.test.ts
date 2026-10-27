import { UserDataCacheRegistry } from '../../core/push/UserDataCacheRegistry';
import { createBootHarness } from '../boot/__testing__/createBootHarness';
import { createHomeHarness } from './__testing__/createHomeHarness';
import { HomeViewModelOwner } from './HomeViewModelOwner';

type HomeHarness = Awaited<ReturnType<typeof createHomeHarness>>;

/** create 콜백은 동기여야 하므로 하네스(비동기 조립)를 미리 만들어 두고 순서대로 꺼내 쓴다. */
let prebuilt: HomeHarness[] = [];

beforeEach(async () => {
  prebuilt = [await createHomeHarness(), await createHomeHarness({ mode: 'guest' })];
});

function setup() {
  const boot = createBootHarness();
  const registry = new UserDataCacheRegistry();
  const created: HomeHarness[] = [];
  const owner = new HomeViewModelOwner({
    boot: boot.viewModel,
    registerCache: (cache) => registry.register(cache),
    create: () => {
      const next = prebuilt.shift();
      if (!next) throw new Error('미리 만든 하네스가 없음');
      created.push(next);
      return next.viewModel;
    },
  });
  return { boot, owner, registry, created };
}

describe('HomeViewModelOwner', () => {
  it('phase가 main이 되면 한 번 만들고 캐시 목록에 올린다(회원/게스트 모드를 넘긴다)', async () => {
    const h = setup();
    expect(h.owner.getSnapshot().viewModel).toBeNull();
    h.boot.viewModel.toMain('member');
    expect(h.created).toHaveLength(1);
    expect(h.owner.getSnapshot().viewModel).toBe(h.created[0].viewModel);

    // 같은 phase에서 다시 알려도 새로 만들지 않는다.
    h.boot.viewModel.toMain('member');
    expect(h.created).toHaveLength(1);

    const clear = jest.spyOn(h.created[0].viewModel, 'clearAll');
    await h.registry.clearAll();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('main을 떠나면 캐시 목록에서 빼고 dispose한 뒤 비운다', async () => {
    const h = setup();
    h.boot.viewModel.toMain('member');
    const vm = h.created[0].viewModel;
    const dispose = jest.spyOn(vm, 'dispose');
    const clear = jest.spyOn(vm, 'clearAll');

    h.boot.viewModel.toLogin();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(h.owner.getSnapshot().viewModel).toBeNull();
    await h.registry.clearAll();
    expect(clear).not.toHaveBeenCalled();
  });

  it('로그인으로 갔다가 다시 main에 들어오면 새로 만든다', async () => {
    const h = setup();
    h.boot.viewModel.toMain('member');
    h.boot.viewModel.toLogin();
    h.boot.viewModel.toMain('guest');
    expect(h.created).toHaveLength(2);
    expect(h.owner.getSnapshot().viewModel).toBe(h.created[1].viewModel);
  });

  it('소유자를 dispose하면 만든 홈도 정리한다', async () => {
    const h = setup();
    h.boot.viewModel.toMain('member');
    const dispose = jest.spyOn(h.created[0].viewModel, 'dispose');
    h.owner.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
