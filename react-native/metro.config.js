// shared/(레포 루트의 공용 자산)의 JSON을 `import`하려면 Metro가 react-native/ 밖 폴더를 감시해야 한다.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const sharedRoot = path.resolve(__dirname, '../shared');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

module.exports = config;
