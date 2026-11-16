module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo (SDK 53+) automatically adds react-native-worklets/plugin
  // when reanimated is installed, so no manual plugin entry is needed for Moti.
  return {
    presets: ['babel-preset-expo'],
  };
};
