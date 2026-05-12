const base = require("./app.json").expo;

const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || base.extra?.eas?.projectId;
const androidVersionCode = Number(process.env.ANDROID_VERSION_CODE || base.android?.versionCode || 1);
const iosBuildNumber = process.env.IOS_BUILD_NUMBER || base.ios?.buildNumber || "1";
const extra = { ...base.extra };

if (easProjectId) {
  extra.eas = { projectId: easProjectId };
} else if (base.extra?.eas) {
  extra.eas = base.extra.eas;
}

module.exports = {
  expo: {
    ...base,
    ios: {
      ...base.ios,
      buildNumber: iosBuildNumber,
    },
    android: {
      ...base.android,
      versionCode: androidVersionCode,
    },
    extra,
  },
};
