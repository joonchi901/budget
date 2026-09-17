import type { Preview } from '@storybook/react-vite';
import '../src/client/app-styles.css';
import './preview.css';

// Prevent accidental writes when exploring a component which can also call an API.
// Storybook's own asset/module requests are unaffected; no production app is mounted.
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          error: { code: 'STORYBOOK_OFFLINE', message: 'UI 명세에서는 서버에 저장하지 않아요.' },
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }
  return originalFetch(input, init);
};

const preview: Preview = {
  tags: ['autodocs'],
  decorators: [
    (Story) => (
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
          '00 Guide',
          '01 Foundations',
          '02 Components',
          '03 Layout',
          '04 Patterns',
          '05 Domain',
        ],
      },
    },
  },
};
export default preview;
