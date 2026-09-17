"""Build the Uga family from the two accepted bases and supplied sticker sheet.

All delivered SVGs consist of paths/shapes, with no embedded raster or fonts.
Requires Pillow, vtracer 0.6.12 (set PYTHONPATH if installed in a private tool dir).
"""
from pathlib import Path
from copy import deepcopy
from collections import deque
import hashlib, json, os, re, shutil, xml.etree.ElementTree as ET
from PIL import Image, ImageDraw
import vtracer

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT/'public/brand'
WORK = Path(__file__).resolve().parent
CROPS=WORK/'crops'
OUT.mkdir(parents=True,exist_ok=True); CROPS.mkdir(exist_ok=True)
SOURCE=Path(os.environ.get('UGA_STICKER_REFERENCE', str(WORK/'reference-sticker-sheet.png')))
ORIGINAL=Image.open(SOURCE).convert('RGBA')
NS='http://www.w3.org/2000/svg'; ET.register_namespace('',NS)
q=lambda x:f'{{{NS}}}{x}'
metadata={}

def base(title,viewbox):
 vals=str(viewbox).split(); r=ET.Element(q('svg'),{'viewBox':viewbox,'width':vals[2],'height':vals[3],'role':'img','aria-label':title})
 ET.SubElement(r,q('title')).text=title
 return r

def save(name,r,origin,kind):
 path=OUT/(name+'.svg'); ET.indent(r,space='  '); ET.ElementTree(r).write(path,encoding='utf-8',xml_declaration=True)
 assert not any(n.tag in {q(x) for x in ['image','text','foreignObject','script']} for n in r.iter())
 assert not any(('href' in k and not v.startswith('#')) for n in r.iter() for k,v in n.attrib.items())
 metadata[name]={'file':f'/brand/{name}.svg','viewBox':r.get('viewBox'),'bytes':path.stat().st_size,'paths':sum(n.tag==q('path') for n in r.iter()),'origin':origin,'kind':kind,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 return r

def components(im,largest=False):
 a=im.getchannel('A'); p=a.load();w,h=im.size; visited=set(); comps=[]
 for y in range(h):
  for x in range(w):
   if not p[x,y] or (x,y) in visited:continue
   c=[]; todo=[(x,y)];visited.add((x,y))
   while todo:
    xx,yy=todo.pop();c.append((xx,yy))
    for nx,ny in [(xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)]:
     if 0<=nx<w and 0<=ny<h and p[nx,ny] and (nx,ny) not in visited: visited.add((nx,ny));todo.append((nx,ny))
   comps.append(c)
 keep=sorted(comps,key=len,reverse=True)[:1] if largest else [c for c in comps if len(c)>=10]
 clean=Image.new('L',im.size);cp=clean.load()
 for c in keep:
  for xy in c:cp[xy]=255
 im.putalpha(clean);return im

def crop(name,box,largest=False,circle=None,remove_bg=False):
 im=ORIGINAL.crop(box);a=im.getchannel('A').point(lambda v:255 if v>=160 else 0);im.putalpha(a)
 if circle:
  mask=Image.new('L',im.size);ImageDraw.Draw(mask).ellipse(circle,fill=255)
  import PIL.ImageChops
  im.putalpha(PIL.ImageChops.multiply(im.getchannel('A'),mask))
 if remove_bg:
  p=im.load()
  for y in range(im.height):
   for x in range(im.width):
    r,g,b,a=p[x,y]
    if a and r>190 and g>130 and b<110:p[x,y]=(r,g,b,0)
 im=components(im,largest)
 bounds=im.getbbox();im=im.crop(bounds)
 padded=Image.new('RGBA',(im.width+12,im.height+12));padded.paste(im,(6,6));padded.save(CROPS/(name+'.png'))
 return padded

def trace(name,im,title,origin,kind):
 inp=CROPS/(name+'.png');im.save(inp);out=OUT/(name+'.svg')
 vtracer.convert_image_to_svg_py(str(inp),str(out),colormode='color',hierarchical='stacked',mode='spline',filter_speckle=5,color_precision=6,layer_difference=24,corner_threshold=60,length_threshold=3.5,max_iterations=10,splice_threshold=45,path_precision=3)
 r=ET.parse(out).getroot();r.attrib.update({'viewBox':f'0 0 {im.width} {im.height}','width':str(im.width),'height':str(im.height),'role':'img','aria-label':title})
 ET.SubElement(r,q('title')).text=title
 return save(name,r,origin,kind)

def art(name,x,y,w,h):
 r=ET.parse(OUT/(name+'.svg')).getroot();r.attrib={'x':str(x),'y':str(y),'width':str(w),'height':str(h),'viewBox':r.get('viewBox'),'preserveAspectRatio':'xMidYMid meet'}
 for n in list(r):
  if n.tag in (q('title'),q('desc')):r.remove(n)
 return r

def markup(r,xml):
 g=ET.fromstring(f'<g xmlns="{NS}">{xml}</g>');r.append(g);return g

# Accepted primary lockup is preserved byte for byte.
logo=ROOT/'design/uga/primary-logo/uga-primary-logo.svg'
shutil.copyfile(logo,OUT/'uga-logo-primary.svg')
lr=ET.parse(logo).getroot();metadata['uga-logo-primary']={'file':'/brand/uga-logo-primary.svg','viewBox':lr.get('viewBox'),'bytes':logo.stat().st_size,'paths':sum(n.tag==q('path') for n in lr.iter()),'origin':'accepted primary logo; unchanged','kind':'logo','sha256':hashlib.sha256(logo.read_bytes()).hexdigest()}

# Accepted representative image, alpha trimmed; no redesign of the silhouette.
rep=Image.open(ROOT/'design/uga/representative/uga-character-v1.png').convert('RGBA')
rep.putalpha(rep.getchannel('A').point(lambda x:255 if x>=160 else 0));rep=rep.crop(rep.getbbox());pad=Image.new('RGBA',(rep.width+24,rep.height+24));pad.paste(rep,(12,12))
trace('uga-character',pad,'우가 대표 캐릭터 — 뼈다귀를 든 인사','accepted representative PNG','character')

regions={
 'wave':((501,120,740,369),False),
 'thumbs-up':((765,123,1017,380),True),
 'celebrate':((992,112,1249,373),True),
 'love':((1255,115,1513,373),False),
 'thinking':((506,394,728,640),False),
 'search':((768,400,993,639),False),
 'record':((1011,402,1239,643),False),
 'work':((1254,400,1506,637),False),
}
labels={'wave':'인사','thumbs-up':'좋아요','celebrate':'축하','love':'사랑','thinking':'고민','search':'찾기','record':'기록','work':'작업 중'}
for pose,(box,largest) in regions.items():
 name='uga-sticker-'+pose;im=crop(name,box,largest)
 trace(name,im,'우가 스티커 — '+labels[pose],f'provided sticker sheet region {box}','sticker')

avatars={'happy':(440,678,568,806),'calm':(567,678,691,806),'surprise':(686,678,812,806),'sleep':(809,678,934,808)}
for mood,box in avatars.items():
 name='uga-avatar-'+mood;w=box[2]-box[0];h=box[3]-box[1]
 im=crop(name,box,True,(3,3,w-3,h-3));trace(name,im,'우가 아바타 — '+mood,f'provided sticker sheet avatar region {box}','avatar')
# Face-only source for compact, monochrome and badge variants.
head=crop('uga-head-happy',(454,694,566,805),True,remove_bg=True)
trace('uga-head-happy',head,'우가 — 웃는 얼굴','provided sheet happy avatar, circle background removed','character')

motifs={'bone':(941,708,1022,820),'bones':(1142,711,1248,824),'heart':(1135,860,1236,955),'star':(1250,852,1357,955),'sprout':(1371,852,1477,962),'meat':(1253,701,1397,820),'moneybag':(1396,698,1506,829)}
for motif,box in motifs.items():
 name='uga-icon-'+motif;trace(name,crop(name,box,True),'우가 소품 — '+motif,f'provided sticker sheet region {box}','motif')

# Application identity uses the accepted representative drawing.
r=base('우가 앱 아이콘','0 0 256 256');markup(r,'<rect x="0" y="0" width="256" height="256" rx="62" fill="#F08A5D"/><rect x="12" y="12" width="232" height="232" rx="53" fill="#F6B284"/><path d="M28 150C63 47 163 24 228 91V225H28Z" fill="#F8C49C"/>');r.append(art('uga-character',20,14,216,230));save('uga-app-icon',r,'accepted representative, coral UI palette','identity')
face=ET.parse(OUT/'uga-head-happy.svg').getroot()
r=base('우가 단색 얼굴',face.get('viewBox'));defs=ET.SubElement(r,q('defs'));mask=ET.SubElement(defs,q('mask'),{'id':'mono-face-cutout','maskUnits':'userSpaceOnUse','x':'0','y':'0','width':face.get('width'),'height':face.get('height')})
for n in face:
 if n.tag!=q('path'):continue
 n=deepcopy(n);fill=n.get('fill')
 if fill and re.match(r'^#[0-9a-fA-F]{6}$',fill):
  vals=[int(fill[i:i+2],16) for i in [1,3,5]];lum=.2126*vals[0]+.7152*vals[1]+.0722*vals[2]
  n.set('fill','#FFFFFF' if lum<115 else '#000000')
 mask.append(n)
ET.SubElement(r,q('rect'),{'width':face.get('width'),'height':face.get('height'),'fill':'#5B4636','mask':'url(#mono-face-cutout)'})
save('uga-monochrome',r,'source happy face; one ink color with transparent cutouts','identity')

# Horizontal lockup keeps the accepted stone letter paths and outlined subtitle.
children=list(lr)
wm=base('우가 — 우리의 가계부 워드마크','10 347 444 300')
for i in [4,6,7,8,9]:
 p=deepcopy(children[i]);p.set('stroke','#271207');p.set('stroke-width','18');p.set('stroke-linejoin','round');wm.append(p)
for i,n in enumerate(children):
 coords=list(map(float,re.findall(r'-?\d*\.?\d+',n.get('d',''))))
 offset=list(map(float,re.findall(r'-?\d*\.?\d+',n.get('transform','0 0'))))
 if i in [45,49]:continue
 if i in [4,6,7,8,9] or (coords and min(coords[1::2])+offset[1]>=360) or n.get('id')=='logo-subtitle':wm.append(deepcopy(n))
save('uga-wordmark',wm,'accepted stone wordmark paths, rebuilt outline','logo')
r=base('우가 — 우리의 가계부 가로 로고','0 0 520 240');r.append(art('uga-character',0,7,226,226));r.append(art('uga-wordmark',214,17,306,207));save('uga-logo-horizontal',r,'accepted representative and accepted wordmark','logo')

# Small functional icons deliberately simplify details at 24px; same outline palette.
functional_icons=ET.parse(WORK/'functional-icons.svg').getroot()
nav=['home','ledger','assets','payments','analytics','planning','tags','data']
for name in nav:
 symbol=next(n for n in functional_icons if n.get('id')=='icon-'+name);r=base('우가 기능 아이콘 — '+name,'0 0 64 64')
 for n in symbol:r.append(deepcopy(n))
 save('uga-icon-'+name,r,'purpose-drawn functional icon; rounded brown outline, ivory stone and gold','functional-icon')

# Badge label is outlined from the local system font before export; never live text.
r=base('우가 PICK 추천 배지','0 0 200 168');markup(r,'<rect x="8" y="105" width="184" height="58" rx="29" fill="#A7D7C5"/><path d="M29 108H171" fill="none" stroke="#CDE8DD" stroke-width="5" stroke-linecap="round"/>');r.append(art('uga-head-happy',45,0,110,119))
label=WORK/'badge-label.svg'
if label.exists():r.append(ET.parse(label).getroot())
save('uga-badge-pick',r,'source happy face and mint capsule; outlined label','badge')

r=base('우가 카드 헤더 일러스트','0 0 360 180');markup(r,'<path d="M15 167l30-45 25 28 28-51 45 68Z" fill="#D8C7B5"/><path d="M63 167l32-39 30 39Z" fill="#B6A697"/><path d="M304 165V132" stroke="#5B4636" stroke-width="5" stroke-linecap="round" fill="none"/>');r.append(art('uga-character',104,4,161,170));r.append(art('uga-icon-sprout',273,109,59,60));r.append(art('uga-icon-star',62,60,35,35));r.append(art('uga-icon-star',283,26,24,24));save('uga-card-header',r,'accepted representative plus source star and sprout','illustration')

pig='''<g stroke="#5B4636" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"><path d="M290 186c16-21 42-13 38-1-3 8-16 2-9-6" fill="none"/><path d="M201 146l-2-27 24 16c39-13 79 8 83 43 4 27-14 43-41 46l-5 13h-16l-3-12-31-6-9 13h-16l2-23c-20-16-24-44-4-59Z" fill="#F0A59A"/><path d="M235 147h24" stroke="#A75D53" fill="none"/><ellipse cx="186" cy="184" rx="19" ry="15" fill="#F7BEB0"/><path d="M180 181v7m11-7v7" stroke-width="3.6"/><circle cx="211" cy="163" r="4" fill="#5B4636" stroke="none"/><path d="M261 159c15 4 20 13 23 23" stroke="#FFD2C2" stroke-width="6" fill="none"/></g>'''
r=base('우가 빈 상태 — 첫 기록을 기다리는 우가','0 0 400 264');markup(r,'<ellipse cx="203" cy="239" rx="144" ry="11" fill="#F6E1C7"/>');r.append(art('uga-character',39,10,216,223));markup(r,pig);r.append(art('uga-icon-sprout',325,172,56,65));r.append(art('uga-icon-heart',290,57,43,42));save('uga-empty-state',r,'accepted representative with purpose-drawn piggybank and source motifs','illustration')
r=base('우가 휴식 스티커','0 0 192 192');r.append(art('uga-avatar-sleep',8,8,176,176));save('uga-sticker-rest',r,'provided sleepy avatar','sticker')

manifest={'version':2,'basis':'accepted representative image and accepted primary logo; source 2 character family','sourceFile':SOURCE.name,'sourceProvenance':'User-provided second reference: ChatGPT Image 2026년 9월 17일 오전 08_40_05.png','sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'primaryLogoPreserved':hashlib.sha256((OUT/'uga-logo-primary.svg').read_bytes()).hexdigest()==hashlib.sha256(logo.read_bytes()).hexdigest(),'rasterEmbedded':False,'liveText':False,'assets':metadata}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'Exported {len(metadata)} SVG assets, {sum(v["bytes"] for v in metadata.values()):,} bytes; accepted primary logo preserved: {manifest["primaryLogoPreserved"]}')
