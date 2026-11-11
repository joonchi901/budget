import type { Preview } from '@storybook/react-vite';
import '../src/client/app-styles.css';
import './preview.css';

const preview: Preview = {
  tags: ['autodocs'],
  decorators: [
    (Story, context) =>
      context.parameters.ownsMain ? (
        <div className="ui-spec-canvas">
          <Story />
        </div>
      ) : (
        <main className="ui-spec-canvas">
          <Story />
        </main>
      ),
  ],
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/ } },
    a11y: { test: 'error', context: 'body' },
    viewport: {
      options: {
        mobile320: {
          name: '작은 모바일 · 320',
          styles: { width: '320px', height: '812px' },
          type: 'mobile',
        },
        mobile390: {
          name: '모바일 · 390',
          styles: { width: '390px', height: '844px' },
          type: 'mobile',
        },
        tablet: {
          name: '태블릿 · 768',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
        desktop: {
          name: '데스크톱 · 1440',
          styles: { width: '1440px', height: '1000px' },
          type: 'desktop',
        },
      },
    },
    options: {
      storySort: {
        order: [
          '00 Guide · 안내',
          '01 Foundations · 기초',
          '02 Atoms · 원자',
          '03 Molecules · 분자',
          '04 Organisms · 유기체',
          '05 Templates · 템플릿',
          '06 Views · 화면',
        ],
      },
    },
  },
};
export default preview;
