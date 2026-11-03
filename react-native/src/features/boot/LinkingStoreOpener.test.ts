import { Linking } from 'react-native';

import { LinkingStoreOpener } from './LinkingStoreOpener';

const PRIMARY = 'market://details?id=app.chalkak';
const FALLBACK = 'https://play.google.com/store/apps/details?id=app.chalkak';

beforeEach(() => {
  jest.mocked(Linking.openURL).mockReset();
});

describe('LinkingStoreOpener', () => {
  it('TC-BOOT-029 첫 URL이 열리면 대체 URL은 시도하지 않는다', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await new LinkingStoreOpener([PRIMARY, FALLBACK]).open();
    expect(open.mock.calls).toEqual([[PRIMARY]]);
  });

  it('TC-BOOT-029 REQ-BOOT-008 market:// 이 실패하면 Play 웹 URL로 연다', async () => {
    const open = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('no market'))
      .mockResolvedValueOnce();
    await new LinkingStoreOpener([PRIMARY, FALLBACK]).open();
    expect(open.mock.calls).toEqual([[PRIMARY], [FALLBACK]]);
  });

  it('TC-BOOT-031 모든 URL이 실패하면 reject', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('boom'));
    await expect(new LinkingStoreOpener([PRIMARY, FALLBACK]).open()).rejects.toThrow('boom');
  });

  it('TC-BOOT-031 URL이 없으면 reject', async () => {
    await expect(new LinkingStoreOpener([]).open()).rejects.toThrow();
  });
});
