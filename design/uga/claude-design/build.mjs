// Builds the Uga design system for Claude Design (the Design System artifact type) from the
// code: tokens.json from tokens.css, the components bundle and stylesheet, one preview and
// guideline per Storybook catalog entry, the font and the brand SVGs.
// Usage: node design/uga/claude-design/build.mjs <out-dir> [uploads.json]
// uploads.json ({"<svg file>": "<blob id>"}) adds the index, project/design-system.json.
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = resolve(process.argv[2] ?? '');
const uploads = process.argv[3] && JSON.parse(readFileSync(process.argv[3], 'utf8'));
if (!process.argv[2]) throw new Error('usage: build.mjs <out-dir> [uploads.json]');
const project = join(out, 'project');
rmSync(project, { recursive: true, force: true });
const write = (path, text) => {
  mkdirSync(dirname(join(project, path)), { recursive: true });
  writeFileSync(join(project, path), text);
};
const TITLE = '우가 디자인 시스템';
const NAMESPACE = 'Uga';
const REACT = '19.3.0';

// ---- tokens.json -------------------------------------------------------------------------
const css = readFileSync(join(root, 'src/client/brand/tokens.css'), 'utf8');
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('@media'));
const declared = [...rootBlock.matchAll(/--(brand-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
  name,
  value.replace(/\s+/g, ' ').trim(),
]);
const usage = {
  'brand-brown': '브랜드 갈색. 주 버튼(brand-primary)의 바탕이고 로고·캐릭터 윤곽과 같은 색이에요.',
  'brand-coral': '코랄 포인트. 일러스트·차트·포커스 그림자에만 쓰고 본문 글자색으로는 쓰지 않아요.',
  'brand-sand': '샌드 베이지. 일러스트와 넓은 장식 면의 채움색.',
  'brand-mint': '민트. 일러스트와 차트 보조색, 성공 테두리(brand-success-line)와 같은 값.',
  'brand-sky': '스카이 블루. 일러스트와 차트 보조색.',
  'brand-cream': '크림 화이트. 앱 바탕(brand-canvas)의 원본.',
  'brand-charcoal': '차콜. 브랜드 보드의 단색 표기용. UI 글자는 brand-text를 써요.',
  'brand-character-hair': '우가 캐릭터 머리·수염. 일러스트 전용.',
  'brand-character-outline': '우가 캐릭터 외곽선. 일러스트 전용.',
  'brand-character-skin': '우가 캐릭터 피부. 일러스트 전용.',
  'brand-character-cheek': '우가 캐릭터 볼. 일러스트 전용.',
  'brand-character-tunic': '우가 캐릭터 옷, 차트 보조색. 일러스트 전용.',
  'brand-character-bone': '우가 캐릭터 뼈 장식. 일러스트 전용.',
  'brand-primary': '주 버튼·선택된 탭·하단 내역 추가 버튼의 바탕. 위 글자는 brand-on-primary.',
  'brand-primary-hover': '주 버튼에 마우스를 올렸을 때.',
  'brand-primary-active': '주 버튼을 누르는 동안.',
  'brand-on-primary': 'brand-primary 위의 글자와 아이콘(약 9:1).',
  'brand-accent':
    '강조 글자·링크·배지·포커스 링. brand-surface, brand-canvas, brand-accent-soft 위에서 4.5:1 이상.',
  'brand-accent-soft': '선택된 칩·강조 영역의 연한 바탕. 위 글자는 brand-accent.',
  'brand-accent-hover': '강조 영역에 마우스를 올렸을 때의 바탕.',
  'brand-accent-line': '강조 영역의 테두리.',
  'brand-text':
    '본문 글자. brand-canvas, brand-surface, brand-surface-subtle, brand-surface-muted 위에서 씀.',
  'brand-text-secondary':
    '보조 글자(기간·아이디·설명). brand-canvas와 brand-surface 위에서 4.5:1 이상.',
  'brand-muted': '흐린 글자(빈 상태, 힌트). brand-canvas와 brand-surface 위에서 4.5:1 이상.',
  'brand-subtle': '자리표시자와 덜 중요한 메타 정보. brand-surface 위에서 4.5:1 이상.',
  'brand-canvas': '페이지 바탕.',
  'brand-surface': '카드·목록·시트의 바탕.',
  'brand-surface-subtle': '입력칸과 검색칸의 바탕.',
  'brand-surface-muted': '세그먼트 컨트롤과 비활성 영역의 바탕.',
  'brand-surface-hover': '목록 줄에 마우스를 올렸을 때의 바탕.',
  'brand-surface-glass': '고정 상단·하단 막대의 반투명 바탕.',
  'brand-line': '카드·목록 구분선과 입력칸 테두리.',
  'brand-line-strong': '체크박스·점선 추가 상자 같은 컨트롤 테두리(3:1 이상).',
  'brand-disabled-bg': '비활성 컨트롤의 바탕.',
  'brand-disabled-text':
    '비활성 컨트롤의 글자. brand-disabled-bg 위에서 4.5:1이 안 돼요(비활성은 대비 기준 예외).',
  'brand-scrollbar-thumb': '스크롤바 손잡이. 투명 트랙 위 갈색 알약, 지나는 면과 3:1.',
  'brand-scrollbar-thumb-hover': '포인터를 올린 스크롤바 손잡이.',
  'brand-scrollbar-size': '스크롤바 굵기. 손잡이는 안쪽 2px을 비워 더 가늘게 보여요.',
  'brand-success':
    '수입 금액과 완료 상태 글자. brand-surface와 brand-success-soft 위에서 4.5:1 이상.',
  'brand-success-soft': '완료·초대 안내의 연한 바탕.',
  'brand-success-line': '완료 상태의 테두리.',
  'brand-danger':
    '지출 금액, 오류, 삭제·탈퇴 같은 되돌릴 수 없는 동작. brand-surface와 brand-danger-soft 위에서 4.5:1 이상.',
  'brand-danger-soft': '오류 메시지의 바탕.',
  'brand-danger-line': '오류 입력칸의 테두리.',
  'brand-warning': '주의 글자. brand-warning-soft 위에서 4.5:1 이상.',
  'brand-warning-soft': '주의 안내의 바탕.',
  'brand-warning-line': '주의 안내의 테두리.',
  'brand-info': '안내 글자. brand-info-soft 위에서 4.5:1 이상.',
  'brand-info-soft': '안내의 바탕.',
  'brand-info-line': '안내의 테두리.',
  'brand-focus-ring': '키보드 포커스 링. 모든 바탕 위에서 3:1 이상.',
  'brand-focus-soft': '포커스 링 바깥의 옅은 번짐.',
  'brand-backdrop': '시트·다이얼로그 뒤를 덮는 막.',
  'brand-shadow-color': '그림자 색(옅음).',
  'brand-shadow-deep': '그림자 색(진함).',
  'brand-shadow-card': '카드와 목록 묶음.',
  'brand-shadow-raised': '떠 있는 카드와 하단 고정 막대.',
  'brand-shadow-popover': '메뉴·날짜 선택·색 선택 팝오버.',
  'brand-shadow-button': '주 버튼과 둥근 추가 버튼.',
  'brand-focus-width': '포커스 링 두께.',
  'brand-focus-offset': '포커스 링과 컨트롤 사이 간격.',
  'brand-control-size': '버튼·아이콘 버튼의 최소 높이(터치 44px).',
  'brand-field-size': '입력칸 높이.',
  'brand-icon-sm': '작은 아이콘(칩 안).',
  'brand-icon-md': '기본 아이콘(버튼 안).',
  'brand-icon-lg': '큰 아이콘(머리 막대).',
  'brand-space-1': '아이콘과 글자 사이.',
  'brand-space-2': '컨트롤 안쪽, 칩 사이.',
  'brand-space-3': '관련된 줄 사이, 목록 줄 안쪽.',
  'brand-space-4': '화면 좌우 여백과 카드 안쪽.',
  'brand-space-5': '폼 필드 사이.',
  'brand-space-6': '섹션 사이.',
  'brand-space-8': '큰 섹션 사이.',
  'brand-space-10': '화면 위아래 큰 여백.',
  'brand-space-12': '첫 화면 위 여백.',
  'brand-radius-xs': '작은 표시(체크박스).',
  'brand-radius-sm': '작은 컨트롤과 색 견본.',
  'brand-radius-control': '버튼·입력칸·세그먼트.',
  'brand-radius-card': '카드·목록 묶음·알림. 안쪽 요소는 이보다 작은 반경으로 겹쳐요.',
  'brand-radius-dialog': '시트와 다이얼로그.',
  'brand-radius-pill': '칩·태그·배지·둥근 추가 버튼.',
};
const sizeUsage = {
  xs: '배지와 아주 작은 메타 정보',
  caption: '설명·힌트·표 머리',
  sm: '보조 글자와 칩',
  body: '본문',
  md: '목록 제목과 버튼',
  section: '방 제목과 섹션 제목',
  title: '화면 큰 제목',
  amount: '큰 금액 입력',
};
const families = {
  color: [],
  shadow: [],
  spacing: [],
  radius: [],
  size: [],
  focus: [],
  fontSize: [],
  fontWeight: [],
  lineHeight: [],
  letterSpacing: [],
};
const bridge = [];
for (const [name, value] of declared) {
  const alias = /^var\(--(brand-[\w-]+)\)$/.exec(value);
  const note = usage[name];
  let family;
  if (name === 'brand-font-body' || name.startsWith('brand-motion') || name === 'brand-ease') {
    bridge.push(`  --${name}: ${name === 'brand-font-body' ? 'var(--font-body)' : value};`);
    continue;
  } else if (name.startsWith('brand-shadow-') && value.includes(' ')) family = 'shadow';
  else if (value.startsWith('#') || alias) family = 'color';
  else if (name.startsWith('brand-space-')) family = 'spacing';
  else if (name.startsWith('brand-radius-')) family = 'radius';
  else if (name.startsWith('brand-focus-')) family = 'focus';
  else if (/brand-(control|field|icon|scrollbar-size)/.test(name)) family = 'size';
  else if (name.startsWith('brand-font-size-')) family = 'fontSize';
  else if (name.startsWith('brand-font-weight-')) family = 'fontWeight';
  else if (name.startsWith('brand-line-height-')) family = 'lineHeight';
  else if (name.startsWith('brand-letter-spacing-')) family = 'letterSpacing';
  else throw new Error(`no family for --${name}`);
  const step = name.split('-').at(-1);
  const autoNote =
    family === 'fontSize'
      ? `${sizeUsage[step]}의 글자 크기.`
      : family === 'fontWeight'
        ? `${step} 굵기. 와구리체는 Regular 하나뿐이라 화면에서는 모두 400으로 보여요.`
        : family === 'lineHeight'
          ? `${step} 줄 간격.`
          : family === 'letterSpacing'
            ? `${step} 자간.`
            : undefined;
  if (!note && !autoNote) throw new Error(`no usage note for --${name}`);
  families[family].push({
    name,
    value: family === 'color' ? (alias ? `{${alias[1]}}` : value.toLowerCase()) : value,
    usage: note ?? autoNote,
  });
}
const px = (rem) => `${parseFloat(rem) * 16}px`;
const size = Object.fromEntries(
  families.fontSize.map((token) => [token.name.split('-').at(-1), token.value]),
);
const style = (name, fontSize, lineHeight, fontWeight, letterSpacing, sample, use) => ({
  name: `text-${name}`,
  fontSize: px(fontSize),
  lineHeight,
  fontWeight,
  ...(letterSpacing ? { letterSpacing } : {}),
  sample,
  usage: use,
});
const tokens = {
  name: TITLE,
  version: 1,
  meta: {
    source: 'local',
    paths: {
      tokens: ['src/client/brand/tokens.css'],
      fonts: ['src/client/brand/fonts/Waguri.woff2'],
      assets: ['public/brand'],
    },
    synced: new Date().toISOString().slice(0, 10),
  },
  color: { themes: [{ id: 'light', name: 'Light' }], tokens: families.color },
  type: {
    fonts: [{ family: 'Waguri', file: 'fonts/Waguri.woff2', weight: '400', style: 'normal' }],
    families: {
      body: "'Waguri', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', sans-serif",
    },
    groups: [
      {
        name: 'Text',
        family: 'body',
        note: '와구리체 하나로 씁니다. 굵기는 Regular뿐이고 브라우저가 굵기를 흉내 내지 않게 막아 두어(font-synthesis: none) 제목도 같은 굵기로 보여요. 위계는 크기와 색으로 만듭니다.',
        styles: [
          style('amount', size.amount, 1.25, 750, '-0.045em', '9,550원', '금액 입력칸의 큰 금액.'),
          style(
            'title',
            size.title,
            1.25,
            750,
            '-0.045em',
            '프로필 만들기',
            '가입·로그인 같은 화면의 큰 제목.',
          ),
          style(
            'section',
            size.section,
            1.35,
            750,
            '-0.045em',
            '11월',
            '방 제목, 시트 제목, 섹션 제목.',
          ),
          style('md', size.md, 1.5, 650, '-0.025em', '장보기_쿠팡', '목록 줄 제목과 버튼 글자.'),
          style(
            'body',
            size.body,
            1.5,
            400,
            '-0.025em',
            '하위 가계부의 내역을 함께 보여줘요.',
            '본문.',
          ),
          style('sm', size.sm, 1.5, 400, '-0.025em', '@yedi_kim · 편집', '보조 글자, 칩, 설명.'),
          style(
            'caption',
            size.caption,
            1.6,
            500,
            undefined,
            '10/23 – 11/22',
            '기간, 힌트, 표 머리.',
          ),
          style('xs', size.xs, 1.6, 500, undefined, '새 내역 3건', '배지와 작은 메타 정보.'),
        ],
      },
    ],
  },
  spacing: { note: '4px 리듬. 화면 좌우 여백은 brand-space-4.', tokens: families.spacing },
  radius: {
    note: '각진 모서리를 두지 않아요. 안쪽 요소일수록 반경이 작아져요.',
    tokens: families.radius,
  },
  shadow: { note: '갈색 기운의 옅은 그림자 두 겹.', tokens: families.shadow },
  size: { note: '터치 크기와 아이콘 크기.', tokens: families.size },
  focus: { note: '포커스 링은 brand-focus-ring 색, 이 두께와 간격.', tokens: families.focus },
  fontSize: { note: 'CSS가 직접 쓰는 글자 크기 변수.', tokens: families.fontSize },
  fontWeight: { tokens: families.fontWeight },
  lineHeight: { tokens: families.lineHeight },
  letterSpacing: { tokens: families.letterSpacing },
};
write('tokens.json', JSON.stringify(tokens, null, 2) + '\n');
// The first tokens.css, laid out as the page compiles it; the page takes it over on its next save.
const decl = (token) =>
  `  --${token.name}: ${/^\{(.+)\}$/.test(token.value) ? `var(--${token.value.slice(1, -1)})` : token.value};`;
write(
  'tokens.css',
  `/* ${TITLE} — generated from tokens.json */
:root, [data-theme="light"] {
${[...families.color, ...families.shadow].map(decl).join('\n')}
}
:root {
${[...families.spacing, ...families.radius, ...families.size, ...families.focus, ...families.fontSize, ...families.fontWeight, ...families.lineHeight, ...families.letterSpacing].map(decl).join('\n')}
${Object.entries(tokens.type.families)
  .map(([key, stack]) => `  --font-${key}: ${stack};`)
  .join('\n')}
}
${tokens.type.groups.flatMap((group) => group.styles.map((item) => `.${item.name} { font-family: var(--font-${group.family}); font-size: ${item.fontSize}; line-height: ${item.lineHeight}; font-weight: ${item.fontWeight};${item.letterSpacing ? ` letter-spacing: ${item.letterSpacing};` : ''} }`)).join('\n')}
${tokens.type.fonts.map((font) => `@font-face { font-family: '${font.family}'; src: url('${font.file}') format('woff2'); font-weight: ${font.weight}; font-style: ${font.style}; font-display: swap; }`).join('\n')}
`,
);

// Contrast self-check for the text pairs the usage notes promise.
const hex = (name) => {
  const token = families.color.find((item) => item.name === name);
  const alias = /^\{(.+)\}$/.exec(token.value);
  return alias ? hex(alias[1]) : token.value;
};
const lum = (value) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
for (const [text, grounds, min] of [
  [
    'brand-text',
    ['brand-canvas', 'brand-surface', 'brand-surface-subtle', 'brand-surface-muted'],
    4.5,
  ],
  ['brand-text-secondary', ['brand-canvas', 'brand-surface'], 4.5],
  ['brand-muted', ['brand-canvas', 'brand-surface'], 4.5],
  ['brand-subtle', ['brand-surface'], 4.5],
  ['brand-accent', ['brand-surface', 'brand-canvas', 'brand-accent-soft'], 4.5],
  ['brand-on-primary', ['brand-primary'], 4.5],
  ['brand-success', ['brand-surface', 'brand-success-soft'], 4.5],
  ['brand-danger', ['brand-surface', 'brand-danger-soft'], 4.5],
  ['brand-warning', ['brand-warning-soft'], 4.5],
  ['brand-info', ['brand-info-soft'], 4.5],
  ['brand-focus-ring', ['brand-canvas', 'brand-surface', 'brand-surface-muted'], 3],
  ['brand-line-strong', ['brand-surface'], 3],
])
  for (const ground of grounds) {
    const value = ratio(text, ground);
    if (value < min) throw new Error(`${text} on ${ground}: ${value.toFixed(2)} < ${min}`);
  }

// ---- libraries and bundle ------------------------------------------------------------------
const globals = {
  name: 'globals',
  setup(b) {
    const map = { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' };
    b.onResolve({ filter: /^react(-dom(\/client)?)?$|^react\/jsx-runtime$/ }, (args) => ({
      path: args.path,
      namespace: 'global',
    }));
    b.onLoad({ filter: /.*/, namespace: 'global' }, (args) => ({
      contents:
        args.path === 'react/jsx-runtime'
          ? 'var R=window.React;exports.Fragment=R.Fragment;exports.jsx=exports.jsxs=function(t,p,k){return R.createElement(t,k===void 0?p:Object.assign({},p,{key:k}))};'
          : `module.exports=window.${map[args.path]};`,
    }));
  },
};
const common = {
  bundle: true,
  minify: true,
  write: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'error',
};
const text = (result, ext) =>
  new TextDecoder().decode(result.outputFiles.find((file) => file.path.endsWith(ext)).contents);
const safe = (source, label) => {
  if (/<\/script|<!--/i.test(source)) throw new Error(`${label} holds </script or <!--`);
  return source;
};
const reactLib = await build({
  ...common,
  stdin: { contents: "import React from 'react'; window.React = React;", resolveDir: root },
  format: 'iife',
  outfile: 'react.js',
});
write('components/lib/react.js', safe(text(reactLib, '.js'), 'react'));
const domPlugin = {
  name: 'react-global',
  setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'react-global' }));
    b.onLoad({ filter: /.*/, namespace: 'react-global' }, () => ({
      contents: 'module.exports=window.React;',
    }));
  },
};
const domLib = await build({
  ...common,
  stdin: {
    contents:
      "import * as D from 'react-dom'; import * as C from 'react-dom/client'; window.ReactDOM = Object.assign({}, D, C);",
    resolveDir: root,
  },
  format: 'iife',
  outfile: 'react-dom.js',
  plugins: [domPlugin],
});
write('components/lib/react-dom.js', safe(text(domLib, '.js'), 'react-dom'));

const catalog = JSON.parse(readFileSync(join(root, 'src/stories/catalog.json'), 'utf8')).filter(
  (entry) => ['02 Atoms', '03 Molecules', '04 Organisms'].includes(entry.layer),
);
const { previews: previewNames } = {
  previews: [
    ...readFileSync(join(here, 'previews.tsx'), 'utf8').matchAll(/^  (\w+): (?:\(\)|function)/gm),
  ].map((m) => m[1]),
};
const cards = catalog.map((entry) => {
  const parts = entry.name.split(' / ');
  const name = parts.find((part) => previewNames.includes(part));
  if (!name) throw new Error(`no preview for ${entry.name}`);
  return {
    ...entry,
    parts,
    card: name,
    group: {
      '02 Atoms': 'Atoms · 원자',
      '03 Molecules': 'Molecules · 분자',
      '04 Organisms': 'Organisms · 유기체',
    }[entry.layer],
  };
});
const bundle = await build({
  ...common,
  entryPoints: [join(here, 'entry.ts')],
  format: 'iife',
  globalName: NAMESPACE,
  outdir: 'out',
  jsx: 'automatic',
  loader: { '.woff2': 'empty', '.png': 'dataurl' },
  plugins: [
    globals,
    {
      name: 'uga-base',
      setup(b) {
        b.onLoad({ filter: /brand\/Uga\.tsx$/ }, (args) => ({
          loader: 'tsx',
          contents: readFileSync(args.path, 'utf8')
            .replaceAll("'/brand/uga-character.svg'", '`${__ugaBase}uga-character.svg`')
            .replaceAll('`/brand/', '`${__ugaBase}'),
        }));
      },
    },
    {
      name: 'no-tokens',
      setup(b) {
        b.onResolve({ filter: /tokens\.css$/ }, () => ({ path: 'tokens', namespace: 'empty-css' }));
        b.onLoad({ filter: /.*/, namespace: 'empty-css' }, () => ({ contents: '', loader: 'css' }));
      },
    },
  ],
  // Uga images live in brand/ beside components/: found from this script's own URL, else from a preview two folders down.
  banner: {
    js: `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: NAMESPACE, components: cards.map((card) => ({ name: card.card })) })} */\nvar __ugaBase=document.currentScript&&document.currentScript.src?new URL("../brand/",document.currentScript.src).href:"../../brand/";`,
  },
});
const js = text(bundle, '.js');
if (js.includes('/brand/uga-')) throw new Error('an image path was not rebased');
write('components/bundle.js', safe(`${js}\nwindow.${NAMESPACE} = ${NAMESPACE};\n`, 'bundle'));
const bundleCss = `/* ${TITLE}: the app stylesheet without tokens.css, whose values come from tokens.json. */
:root {
${bridge.join('\n')}
}
@media (prefers-reduced-motion: reduce) {
  :root { --brand-motion-fast: 0ms; --brand-motion-normal: 0ms; --brand-motion-slow: 0ms; }
}
${text(bundle, '.css')}
/* Preview frames only. */
.ds-frame { padding: var(--brand-space-4); }
.ds-phone { max-width: 390px; }
.ds-check { display: inline-flex; align-items: center; gap: var(--brand-space-2); }
`;
if (/<\/style/i.test(bundleCss)) throw new Error('bundle.css holds </style');
write('components/bundle.css', bundleCss);

// ---- component guidelines and types (props read with the TypeScript checker) ----------------
const program = ts.createProgram([join(here, 'entry.ts')], {
  ...ts.getDefaultCompilerOptions(),
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  strict: true,
  allowImportingTsExtensions: true,
  noEmit: true,
  types: [],
});
const checker = program.getTypeChecker();
const entryModule = checker.getSymbolAtLocation(program.getSourceFile(join(here, 'entry.ts')));
const exportsByName = new Map(
  checker.getExportsOfModule(entryModule).map((symbol) => [symbol.name, symbol]),
);
const docOf = (symbol) =>
  ts
    .displayPartsToString(symbol.getDocumentationComment(checker))
    .replace(/\s*\n\s*/g, ' ')
    .trim();
const propsOf = (name) => {
  let symbol = exportsByName.get(name);
  if (!symbol) return undefined;
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  const declaration = symbol.declarations?.[0];
  const signature = checker.getTypeOfSymbolAtLocation(symbol, declaration).getCallSignatures()[0];
  const param = signature?.parameters[0];
  const own = param
    ? checker
        .getTypeOfSymbolAtLocation(param, declaration)
        .getProperties()
        .filter((prop) =>
          prop.declarations?.some(
            (decl) => !decl.getSourceFile().fileName.includes('node_modules'),
          ),
        )
    : [];
  return {
    doc: docOf(symbol),
    props: own.map((prop) => ({
      name: prop.name,
      optional: Boolean(prop.flags & ts.SymbolFlags.Optional),
      type: checker
        .typeToString(
          checker.getTypeOfSymbolAtLocation(prop, declaration),
          undefined,
          ts.TypeFormatFlags.NoTruncation,
        )
        .replace(/import\("[^"]+"\)\./g, ''),
      doc: docOf(prop),
    })),
  };
};
const heights = { Atoms: 120, Molecules: 160, Organisms: 360 };
const tall = {
  DateField: 220,
  ChipSelect: 220,
  StatBar: 200,
  Panel: 260,
  TextField: 260,
  FormBody: 220,
  Input: 220,
  Stack: 200,
  Notice: 100,
  RoomHeader: 120,
  RoomTabBar: 140,
  SummaryStrip: 140,
  RecordFilterBar: 160,
  PersonRow: 200,
  AvatarPicker: 220,
  ProfilePicture: 120,
  KindOptionEditor: 420,
  RoomInviteRow: 140,
  FriendPicker: 280,
  MemberList: 300,
  RoomListItem: 300,
  RecordList: 560,
  RecordTable: 420,
  PeriodCalendar: 520,
  StatsBreakdown: 620,
  StatCardView: 1400,
  RecurringList: 520,
  RecordForm: 860,
  TagOptionEditor: 420,
  ParentPicker: 160,
  FriendList: 520,
  List: 200,
};
const types = [];
for (const card of cards) {
  const docs = card.parts.map((part) => [part, propsOf(part)]).filter(([, info]) => info);
  const story = card.story.replace(/^src\/stories\//, '');
  write(
    `components/${card.card}/preview.html`,
    `<!-- @dsCard group="${card.group}" height=${tall[card.card] ?? heights[card.group.split(' ')[0]]} subtitle="${card.parts.join(' · ')}" -->
<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>${card.card} — preview</title></head>
<body>
<div id="root"></div>
<script>
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window.${NAMESPACE}.previews.${card.card}));
</script>
</body>
</html>
`,
  );
  const sections = docs.map(([part, info]) =>
    [
      `## ${part}`,
      '',
      ...(info.doc ? [info.doc, ''] : []),
      ...(info.props.length
        ? info.props.map(
            (prop) =>
              `- \`${prop.name}${prop.optional ? '?' : ''}\`: \`${prop.type}\`${prop.doc ? ` — ${prop.doc}` : ''}`,
          )
        : ['네이티브 요소의 속성을 그대로 받아요.']),
      '',
    ].join('\n'),
  );
  write(
    `components/${card.card}/README.md`,
    `# ${card.card}

${card.usage.replace(/[.。]?$/, '.')}

${card.parts.length > 1 ? `이 카드는 ${card.parts.join(', ')}를 함께 다뤄요. ` : ''}앱에서는 \`src/client/${card.source.split('src/client/')[1]}\`, Storybook에서는 \`${story}\`에 있어요. 화면 문구는 해요체로 쓰고, 색은 토큰으로만 지정해요.

${sections.join('\n')}`,
  );
  for (const [part, info] of docs)
    types.push(
      `/** ${info.doc || card.usage} */\nexport interface ${part}Props {\n${info.props.map((prop) => `  ${prop.doc ? `/** ${prop.doc} */\n  ` : ''}${/^[\w$]+$/.test(prop.name) ? prop.name : JSON.stringify(prop.name)}${prop.optional ? '?' : ''}: ${prop.type};`).join('\n')}\n}\nexport declare function ${part}(props: ${part}Props): JSX.Element;\n`,
    );
}
write(
  'components/index.d.ts',
  `// ${TITLE}: component props, read from the source types (documentation, not type-checked).\n\n${types.join('\n')}`,
);

// ---- brand book, cover, font, images --------------------------------------------------------
write('README.md', readFileSync(join(here, 'README.md'), 'utf8'));
write('components/Cover/preview.html', readFileSync(join(here, 'cover.html'), 'utf8'));
mkdirSync(join(project, 'fonts'), { recursive: true });
copyFileSync(
  join(root, 'src/client/brand/fonts/Waguri.woff2'),
  join(project, 'fonts/Waguri.woff2'),
);
const brand = join(root, 'public/brand');
const svgs = readdirSync(brand)
  .filter((file) => file.endsWith('.svg'))
  .sort();
mkdirSync(join(project, 'brand'), { recursive: true });
for (const file of svgs) copyFileSync(join(brand, file), join(project, 'brand', file));
// Reaction stickers (256px originals and the 96px copies reactions draw) and decorations, as PNG.
const pngsIn = (dir) =>
  readdirSync(join(brand, dir))
    .filter((file) => file.endsWith('.png'))
    .sort()
    .map((file) => `${dir}/${file}`);
const reactionPngs = [
  'reactions/stickers',
  'reactions/stickers-96',
  'reactions/decorations',
].flatMap(pngsIn);
for (const file of reactionPngs) {
  mkdirSync(dirname(join(project, 'brand', file)), { recursive: true });
  copyFileSync(join(brand, file), join(project, 'brand', file));
}
const groupOf = (file) =>
  /^uga-(logo|wordmark|monochrome|app-icon)/.test(file)
    ? 'Logos'
    : /^uga-avatar-/.test(file)
      ? 'Avatars'
      : /^uga-icon-/.test(file)
        ? 'Icons'
        : /^uga-(character|head|sticker)/.test(file)
          ? 'Mascot'
          : 'Illustrations';
const assetGroups = {
  Logos: {
    tile: 'l',
    note: '로고. 원본 SVG 그대로 쓰고 색을 바꾸거나 다시 그리지 않아요. `uga-logo-primary.svg`는 첫 화면·로그인, `uga-logo-horizontal.svg`는 좁은 머리 막대, `uga-wordmark.svg`는 글자만, `uga-monochrome.svg`는 한 가지 색(brand-brown)만 쓸 수 있는 곳, `uga-app-icon-moneybag-imagegen.svg`(돈주머니와 뼈다귀)는 앱 아이콘이자 파비콘이고 접힌 데스크톱 메뉴의 작은 로고예요. `uga-wordmark-icon.svg`는 우가 글자만 정사각형에 담은 것, `uga-app-icon.svg`는 이전 앱 아이콘이에요.',
  },
  Mascot: {
    tile: 'm',
    note: '대표 캐릭터 우가와 스티커. 빈 상태·완료·안내 같은 감정이 있는 순간에만 한 번 쓰고, 데이터 옆 장식으로 쓰지 않아요. 색은 brand-character-* 토큰과 같아요.',
  },
  Avatars: {
    tile: 's',
    note: '기본 프로필 그림 4종(happy, calm, surprise, sleep). 사진을 올리지 않았거나 지웠을 때 이 중 고른 것을 써요. 저장된 이름도 이 넷만 받아요.',
  },
  Icons: {
    tile: 'xs',
    note: '가계부 아이콘 15종. 가계부마다 하나를 고르고, 방 목록과 방 머리에 같은 그림으로 나와요. 여러 색 그림이라 CSS color로 바뀌지 않아요. 화면 조작 아이콘(뒤로, 메뉴, 설정)은 lucide-react 선 아이콘을 써요.',
  },
  Illustrations: {
    tile: 'm',
    note: '빈 상태(`uga-empty-state.svg`), 카드 머리 장식, 선택 배지 그림.',
  },
  Reactions: {
    tile: 'm',
    note: '내역에 다는 반응 스티커 30종(대화 12·감정 18, 256px PNG). 반응에는 `reactions/stickers-96/`의 96px 사본을 칩 22px·고르기 44px로 써요. 문구가 없어 같은 표정에 상황에 맞는 말을 붙일 수 있어요. 저장된 반응 이름은 이 30종과 장식 23종만 받아요.',
    files: pngsIn('reactions/stickers'),
  },
  Decorations: {
    tile: 'xs',
    note: '작은 장식 23종(128px PNG). 스티커 옆이나 빈 상태에 곁들이고, 반응과 대화에서는 스티커처럼 골라 보내요(칩 22px·고르기 44px).',
    files: pngsIn('reactions/decorations'),
  },
};
const filesOf = (group) =>
  assetGroups[group].files ?? svgs.filter((file) => groupOf(file) === group);
for (const [group, info] of Object.entries(assetGroups))
  write(
    `assets/${group}/README.md`,
    `# ${group}\n\n${info.note}\n\n${filesOf(group)
      .map((file) => `- \`${file}\``)
      .join('\n')}\n`,
  );

// ---- the index -------------------------------------------------------------------------------
if (uploads) {
  const now = new Date().toISOString();
  const index = {
    v: 3,
    layout: 'files',
    createdOnFiles: { v: 1, at: now },
    title: TITLE,
    namespace: NAMESPACE,
    libraries: [
      { name: 'react', version: REACT, global: 'React', file: 'components/lib/react.js' },
      {
        name: 'react-dom',
        version: REACT,
        global: 'ReactDOM',
        file: 'components/lib/react-dom.js',
      },
    ],
    sections: {},
    groups: Object.keys(assetGroups),
    assetGroups: Object.fromEntries(
      Object.entries(assetGroups).map(([group, info]) => {
        const files = filesOf(group);
        return [
          group,
          {
            name: group,
            tile: info.tile,
            order: files,
            files: Object.fromEntries(
              files.map((file) => {
                if (!uploads[file]) throw new Error(`no upload for ${file}`);
                return [
                  file,
                  {
                    name: file,
                    blob: uploads[file],
                    size: statSync(join(brand, file)).size,
                    type: file.endsWith('.png') ? 'image/png' : 'image/svg+xml',
                  },
                ];
              }),
            ),
          },
        ];
      }),
    ),
    blobs: {},
    docs: { sections: [] },
    lastChange: {
      by: 'Claude',
      at: now,
      via: 'Claude Code',
      note: '코드(tokens.css, src/client, public/brand)에서 처음 만듦',
    },
  };
  write('design-system.json', JSON.stringify(index, null, 2) + '\n');
}
console.log(
  `${cards.length} components · ${families.color.length} colors · ${svgs.length + reactionPngs.length} images → ${project}`,
);
