"""Rebuild the reference-faithful logo as actual SVG paths (vtracer 0.6.12)."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import vtracer

ROOT = Path(__file__).resolve().parents[1]
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
target = ROOT / 'uga-primary-logo.svg'
vtracer.convert_image_to_svg_py(
    str(ROOT / 'source/logo-reference.png'), str(target),
    colormode='color', hierarchical='stacked', mode='spline',
    filter_speckle=5, color_precision=6, layer_difference=24,
    corner_threshold=60, length_threshold=3.5, max_iterations=10,
    splice_threshold=45, path_precision=3,
)
svg = ET.parse(target).getroot()
svg.attrib.update({'viewBox':'-12 -12 480 667','width':'480','height':'667','role':'img','aria-labelledby':'logo-title logo-description'})

# Replace the small raster-derived lettering with matching rounded vector strokes.
# The traced paths use absolute commands plus a translate; every control point
# gives a conservative enclosure for the subtitle-only area.
for path in list(svg):
    coords = list(map(float, re.findall(r'-?\d*\.?\d+', path.get('d',''))))
    if not coords:
        continue
    offset = list(map(float, re.findall(r'-?\d*\.?\d+',path.get('transform','translate(0,0)'))))
    xs, ys = coords[::2], coords[1::2]
    bounds = [min(xs)+offset[0], min(ys)+offset[1], max(xs)+offset[0], max(ys)+offset[1]]
    if bounds[0]>110 and bounds[1]>560 and bounds[2]<350 and bounds[3]<615:
        svg.remove(path)
subtitle = list(ET.parse(ROOT / 'source/subtitle.svg').getroot())[0]
svg.append(subtitle)
title = ET.Element(f'{{{NS}}}title',{'id':'logo-title'})
title.text = '우가 — 우리의 가계부'
desc = ET.Element(f'{{{NS}}}desc',{'id':'logo-description'})
desc.text = '뼈다귀를 들고 윙크하는 수염 우가, 돌 모양 우가 글자와 우리의 가계부 명패. 투명 배경의 독립 벡터 로고.'
svg.insert(0,desc);svg.insert(0,title)
ET.indent(svg,space='  ')
ET.ElementTree(svg).write(target,encoding='utf-8',xml_declaration=True)
assert not any(node.tag in [f'{{{NS}}}image',f'{{{NS}}}text',f'{{{NS}}}script',f'{{{NS}}}foreignObject'] for node in svg.iter())
print(f'Exported {target.name}: {sum(1 for n in svg.iter() if n.tag==f"{{{NS}}}path")} vector paths, no raster or font dependencies.')
