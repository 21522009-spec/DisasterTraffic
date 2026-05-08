module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // react-native-worklets/plugin BẮT BUỘC cho react-native-reanimated 4+
            // (thay thế react-native-reanimated/plugin của bản v2/v3)
            // Plugin này phải đặt cuối cùng trong list plugins.
            'react-native-worklets/plugin',
        ],
    };
};
