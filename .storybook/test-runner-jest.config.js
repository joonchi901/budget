import { getJestConfig } from '@storybook/test-runner';

const config = getJestConfig();
// Load our typed hooks through Jest's supported transform. Storybook 10.6's
// generic config importer uses module.register(), which Jest 30.5 rejects.
export default {
  ...config,
  setupFilesAfterEnv: [...config.setupFilesAfterEnv, '<rootDir>/.storybook/browser-checks.ts'],
};
