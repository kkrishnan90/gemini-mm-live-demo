// frontend/config-overrides.js

module.exports = function override(config, env) {
  // --- Step 1: Exclude our .worklet.js files from the default CRA babel-loader.
  
  // Find the main 'oneOf' rule array.
  const oneOfRule = config.module.rules.find(rule => rule.oneOf);
  if (oneOfRule) {
    // Find the rule that processes application source code with babel-loader.
    const tsRule = oneOfRule.oneOf.find(
      rule => rule.test && rule.test.toString().includes('ts|tsx|js|jsx|mjs')
    );

    if (tsRule) {
      // Add our .worklet.js extension to the exclude list.
      if (!tsRule.exclude) {
        tsRule.exclude = [];
      }
      tsRule.exclude.push(/\.worklet\.js$/);
    }
  }

  // --- Step 2: Add our own rule for .worklet.js files.
  
  // This rule will be processed by worker-loader, which correctly bundles
  // the worklet and its dependencies into a separate file.
  config.module.rules.push({
    test: /\.worklet\.js$/,
    use: [
      {
        loader: 'worker-loader',
        options: {
          // Use a specific filename format for our worklet bundle
          filename: 'static/js/[name].[contenthash:8].js',
        },
      },
      {
        // We also need babel to transpile our worklet code
        loader: require.resolve('babel-loader'),
      },
    ],
  });

  return config;
};