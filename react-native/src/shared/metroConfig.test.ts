import path from 'node:path';

// Metro가 react-native/ 밖의 shared/를 감시하는지 확인한다(번들 없이 설정만 로드).
describe('metro.config.js', () => {
  it('watchFolders에 레포 루트의 shared가 들어 있다', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require('../../metro.config.js') as { watchFolders: string[] };
    expect(config.watchFolders).toContain(path.resolve(__dirname, '../../../shared'));
  });
});
