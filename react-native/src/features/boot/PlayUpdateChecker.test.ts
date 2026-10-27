import { loadFixture } from '../../core/http/__testing__/loadFixture';
import { PlayUpdateChecker, type PlayUpdateInfo } from './PlayUpdateChecker';
import { FakePlayUpdateClient } from './__testing__/fakes';

type Native = {
  data: { updateAvailability: PlayUpdateInfo['availability']; updatePriority: number };
};
const toInfo = (name: string): PlayUpdateInfo => {
  const { data } = loadFixture<Native>(name);
  return { availability: data.updateAvailability, priority: data.updatePriority };
};

describe('PlayUpdateChecker', () => {
  it('TC-BOOT-030 우선순위 1 이상이면 강제 업데이트다(fixture)', async () => {
    const client = new FakePlayUpdateClient();
    client.info = toInfo('boot/play-update__priority-1');
    await expect(new PlayUpdateChecker(client).check()).resolves.toBe('update-required');
  });

  it('TC-BOOT-030 우선순위 0이면 통과한다(fixture)', async () => {
    const client = new FakePlayUpdateClient();
    client.info = toInfo('boot/play-update__priority-0');
    await expect(new PlayUpdateChecker(client).check()).resolves.toBe('up-to-date');
  });

  it('TC-BOOT-030 우선순위가 높아도 가능한 업데이트가 없으면 통과한다', async () => {
    const client = new FakePlayUpdateClient();
    client.info = { availability: 'UPDATE_NOT_AVAILABLE', priority: 5 };
    await expect(new PlayUpdateChecker(client).check()).resolves.toBe('up-to-date');
  });

  it('TC-BOOT-030 우선순위 경계: 0은 통과, 1은 강제', async () => {
    const client = new FakePlayUpdateClient();
    const checker = new PlayUpdateChecker(client);
    client.info = { availability: 'UPDATE_AVAILABLE', priority: 0 };
    await expect(checker.check()).resolves.toBe('up-to-date');
    client.info = { availability: 'UPDATE_AVAILABLE', priority: 1 };
    await expect(checker.check()).resolves.toBe('update-required');
  });

  it('TC-BOOT-023 정보 조회가 실패하면 앱을 막지 않고 통과(unavailable)한다(D-15, 차단 화면 없음)', async () => {
    const client = new FakePlayUpdateClient();
    client.info = new Error('play services unavailable');
    await expect(new PlayUpdateChecker(client).check()).resolves.toBe('unavailable');
  });
});
