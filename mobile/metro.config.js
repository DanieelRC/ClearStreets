const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Modelos de visión empaquetados como assets (react-native-fast-tflite).
config.resolver.assetExts.push('tflite');

module.exports = config;
