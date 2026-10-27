import { Linking } from 'react-native';

import { LinkingExternalLinkOpener } from './LinkingExternalLinkOpener';

describe('LinkingExternalLinkOpener', () => {
  afterEach(() => jest.restoreAllMocks());

  it('열리면 true', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    expect(await new LinkingExternalLinkOpener().open('https://example.com')).toBe(true);
    expect(spy).toHaveBeenCalledWith('https://example.com');
  });

  it('열 수 없어 reject되면 던지지 않고 false', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    expect(await new LinkingExternalLinkOpener().open('https://example.com')).toBe(false);
  });
});
