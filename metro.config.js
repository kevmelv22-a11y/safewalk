// Sluit het admin-webproject uit van de Metro-bundler van de app.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.blockList = [/admin\/.*/];
// react-native-maps heeft geen web-ondersteuning: op web een lichte vervanger gebruiken.
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (ctx, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps')
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'src/web/react-native-maps.tsx') };
  return (upstream ?? ctx.resolveRequest)(ctx, moduleName, platform);
};
module.exports = config;
