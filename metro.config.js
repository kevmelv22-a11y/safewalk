// Sluit het admin-webproject uit van de Metro-bundler van de app.
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.blockList = [/admin\/.*/];
module.exports = config;
