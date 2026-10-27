import { Linking } from 'react-native';

import { LinkingExternalLinkOpener } from './LinkingExternalLinkOpener';

const URL_UNDER_TEST = 'https://example.test/a';

// RN jest 목의 Linking 함수는 jest.fn이라 restoreAllMocks가 호출 기록을 지우지 않는다.
beforeEach(() => {
  jest.mocked(Linking.openURL).mockClear();
  jest.mocked(Linking.canOpenURL).mockClear();
});

describe('LinkingExternalLinkOpener', () => {
  it('열 수 있으면 열고 opened', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await expect(new LinkingExternalLinkOpener().open(URL_UNDER_TEST)).resolves.toBe('opened');
    expect(open).toHaveBeenCalledWith(URL_UNDER_TEST);
  });

  it('열 수 있는 앱이 없으면 열지 않고 no-browser', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await expect(new LinkingExternalLinkOpener().open(URL_UNDER_TEST)).resolves.toBe('no-browser');
    expect(open).not.toHaveBeenCalled();
  });

  it('열기가 거부되면 던지지 않고 failed', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('boom'));
    await expect(new LinkingExternalLinkOpener().open(URL_UNDER_TEST)).resolves.toBe('failed');
  });

  it('canOpenURL이 던져도 failed', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockRejectedValue(new Error('boom'));
    await expect(new LinkingExternalLinkOpener().open(URL_UNDER_TEST)).resolves.toBe('failed');
  });
});
