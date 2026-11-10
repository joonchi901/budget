// Renders the home-screen icons from the money bag app icon (build-assets.py writes its SVG):
// iOS apple-touch-icon (180) and the install icons in public/manifest.webmanifest (192, 512, and
// a maskable 512). Each is opaque, on the manifest's background colour, since iOS fills
// transparency with black and launchers mask the corners.
// Usage: node design/uga/system/source/render-app-icons.mjs
// shortcut: sharp comes with wrangler (miniflare); add it as a devDependency if that changes.
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '../../../..');
const brand = path.join(root, 'public/brand');
const source = path.join(brand, 'uga-app-icon-moneybag-imagegen.svg');
const background = '#FAF8F4';
// The artwork fills its square edge to edge. `art` is its share of the icon: a margin all round,
// and for maskable the 80% safe circle (the bag's corners stay inside it at 66%).
const icons = [
  { file: 'uga-app-icon-180.png', size: 180, art: 0.8 },
  { file: 'uga-app-icon-192.png', size: 192, art: 0.8 },
  { file: 'uga-app-icon-512.png', size: 512, art: 0.8 },
  { file: 'uga-app-icon-maskable-512.png', size: 512, art: 0.66 },
];
for (const { file, size, art } of icons) {
  const side = Math.round(size * art);
  // The SVG is 256px; render it larger than needed and scale down for clean edges.
  const picture = await sharp(source, { density: Math.ceil((72 * side * 2) / 256) })
    .resize(side, side)
    .png()
    .toBuffer();
  const offset = Math.round((size - side) / 2);
  await sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: picture, left: offset, top: offset }])
    .removeAlpha()
    .png()
    .toFile(path.join(brand, file));
  console.log(file, `${size}px`);
}
