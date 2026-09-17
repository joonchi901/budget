import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

addons.setConfig({
  theme: create({
    base: 'light',
    brandTitle: '우가 · UI 명세',
    brandImage: '/brand/uga-logo-horizontal.svg',
    colorPrimary: '#5b4636',
    colorSecondary: '#ad4f2c',
  }),
});
