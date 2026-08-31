const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Firebase Auth RN persistence resolves via package exports; disable for Metro.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
