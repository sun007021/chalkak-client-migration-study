import { UserDataCacheRegistry } from '../../core/push/UserDataCacheRegistry';
import { createBootHarness } from '../boot/__testing__/createBootHarness';
import { createRecordHarness } from './__testing__/createRecordHarness';
import { RecordViewModelOwner } from './RecordViewModelOwner';

type Harness = Awaited<ReturnType<typeof createRecordHarness>>;
let prebuilt: Harness[] = [];

beforeEach(async () => {
  prebuilt = [await createRecordHarness(), await createRecordHarness({ mode: 'guest' })];
});

function setup() {
  const boot = createBootHarness();
  const registry = new UserDataCacheRegistry();
  const created: Harness[] = [];
  const owner = new RecordViewModelOwner({
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

describe('RecordViewModelOwner', () => {
  it('TC-REC-028 main이 되면 한 번 만들어 캐시 목록에 올리고, 계정 전환(clearAll)이 기록을 비운다', async () => {
    const h = setup();
    h.boot.viewModel.toMain('member');
    expect(h.created).toHaveLength(1);
    const clear = jest.spyOn(h.created[0].viewModel, 'clearAll');
    await h.registry.clearAll();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('main을 떠나면 dispose하고 캐시 목록에서 뺀다', async () => {
    const h = setup();
    h.boot.viewModel.toMain('member');
    const dispose = jest.spyOn(h.created[0].viewModel, 'dispose');
    h.boot.viewModel.toLogin();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(h.owner.getSnapshot().viewModel).toBeNull();
  });
});
