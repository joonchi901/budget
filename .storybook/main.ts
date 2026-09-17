import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.tsx'],
  framework: {
    name: '@storybook/react-vite',
    // The product config proxies /api to a Worker. The UI specification has no backend.
    options: { builder: { viteConfigPath: '.storybook/vite.config.ts' } },
  },
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  staticDirs: ['../public'],
  core: { disableTelemetry: true },
  async viteFinal(config) {
    return {
      ...config,
      server: { ...config.server, host: '127.0.0.1', proxy: undefined },
    };
  },
};
export default config;
