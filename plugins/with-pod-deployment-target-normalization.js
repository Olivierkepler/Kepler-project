const { withPodfile } = require('expo/config-plugins');

const START_MARKER = '# @generated begin BuildSigma Pod deployment target normalization';
const END_MARKER = '# @generated end BuildSigma Pod deployment target normalization';

const NORMALIZATION_BLOCK = `${START_MARKER}
installer.pods_project.targets.each do |target|
  target.build_configurations.each do |build_configuration|
    deployment_target =
      build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']

    if deployment_target &&
       deployment_target.to_f < min_ios_version_supported.to_f
      build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] =
        min_ios_version_supported
    end
  end
end
${END_MARKER}`;

function withPodDeploymentTargetNormalization(config) {
  return withPodfile(config, (config) => {
    const contents = config.modResults.contents;
    const startCount = contents.split(START_MARKER).length - 1;
    const endCount = contents.split(END_MARKER).length - 1;

    if (startCount === 1 && endCount === 1) {
      return config;
    }

    if (startCount !== 0 || endCount !== 0) {
      throw new Error(
        'Podfile contains incomplete or duplicate BuildSigma deployment-target normalization markers.'
      );
    }

    const callStarts = [
      ...contents.matchAll(/^([ \t]*)react_native_post_install\(\s*$/gm),
    ];

    if (callStarts.length !== 1) {
      throw new Error(
        `Expected exactly one multiline react_native_post_install( call in the generated Podfile; found ${callStarts.length}.`
      );
    }

    const indent = callStarts[0][1];
    const closingLine = new RegExp(`^${indent}\\)(?:[ \\t]*\\r?\\n|[ \\t]*$)`, 'gm');
    closingLine.lastIndex = callStarts[0].index + callStarts[0][0].length;

    const closingMatch = closingLine.exec(contents);

    if (!closingMatch) {
      throw new Error(
        'Could not find the closing line for react_native_post_install( in the generated Podfile.'
      );
    }

    const insertionPoint = closingMatch.index + closingMatch[0].length;
    config.modResults.contents =
      contents.slice(0, insertionPoint) +
      `\n${NORMALIZATION_BLOCK}\n` +
      contents.slice(insertionPoint);

    return config;
  });
}

module.exports = withPodDeploymentTargetNormalization;
