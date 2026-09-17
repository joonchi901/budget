"""Build the review board from the actual runtime brand tokens and SVG assets."""
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parents[4]
HERE = ROOT / 'design/uga/system'
TOKENS = (ROOT / 'src/client/brand/tokens.css').read_text()
STYLES = (HERE / 'source/board.css').read_text()

def build(base):
    def img(name, cls='', label='', width=None):
        size = f' width="{width}"' if width else ''
        return f'<img src="{base}/uga-{name}.svg" class="{cls}" alt="{escape(label)}"{size}>'
    def title(en, ko):
        return f'<div class="section-label"><span>{en}</span><i></i>{ko}</div>'
    palette = [('brown','브라운','#5B4636','메인'),('coral','코랄 오렌지','#F08A5D','포인트'),('sand','샌드 베이지','#F6E1C7','배경'),('mint','민트 그린','#A7D7C5','보조'),('sky','스카이 블루','#7CC7F2','보조'),('cream','크림 화이트','#FAF8F4','배경'),('charcoal','차콜 그레이','#4B4B4B','텍스트')]
    swatches = ''.join(f'<div class="swatch"><b style="background:{v}"></b><strong>{v}</strong><span>{label}</span><small>{role}</small></div>' for key,label,v,role in palette)
    stickers = ''.join(f'<div>{img("sticker-"+key)}<span>{label}</span></div>' for key,label in [('thumbs-up','좋아요!'),('celebrate','화이팅!'),('love','소중한 우리'),('rest','오늘도 수고했어요')])
    iconset = ''.join(f'<div>{img("icon-"+key)}<span>{label}</span></div>' for key,label in [('ledger','가계부'),('assets','자산'),('payments','카드·통장'),('analytics','통계'),('planning','계획'),('tags','태그'),('data','데이터'),('home','우리집'),('bone','기록'),('heart','마음'),('star','기념일'),('sprout','성장')])
    allposes = ''.join(f'<div>{img("sticker-"+key)}<span>{label}</span></div>' for key,label in [('wave','인사'),('thumbs-up','좋아요'),('celebrate','축하'),('love','사랑'),('thinking','생각'),('search','살펴보기'),('record','기록'),('work','작업'),('rest','휴식')])
    return f'''<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>우가 · 디자인 시스템</title><style>{TOKENS}\n{STYLES}</style></head>
<body><main>
<section id="brand-board" class="board brand-board" aria-label="우가 브랜드 보드">
  <header class="brand-hero">
    <div class="hero-copy"><span class="eyebrow">우가 — 우리의 가계부</span><h1>우리가 쓰는 오늘,<br>더 나은 내일.</h1><p>소중한 오늘의 기록이<br>더 나은 내일이 되는 순간,<br>우가가 함께해요.</p><div class="hero-rule"></div><small>SIMPLE · FRIENDLY<br>FOR A BRIGHTER TOMORROW</small></div>
    {img('logo-primary','hero-logo','우가 — 우리의 가계부')}
    <div class="hero-message"><span class="eyebrow">작은 습관, 함께하는 변화</span><blockquote>“작은 기록이<br>큰 변화를 만들어요.”</blockquote><p>우가와 함께, 더 나은 내일을.</p><div class="landscape">{img('icon-sprout','',width=70)}<svg viewBox="0 0 190 85" aria-hidden="true"><circle cx="160" cy="23" r="17" fill="#F6BD77"/><path d="M25 76 58 29Q65 20 72 31L91 53 115 15Q123 3 132 16L171 76Z" fill="#C5B9AD"/><path d="m69 76 45-61q9-12 18 1l39 60Z" fill="#AFA397"/></svg></div></div>
  </header>
  <div class="identity-grid">
    <article class="tile identity">{title('Primary Logo Lockup','기본 로고')}<div class="asset-stage">{img('logo-primary','primary-logo')}</div><p>캐릭터 + 돌 글자 + 우리의 가계부</p></article>
    <article class="tile identity">{title('App Icon','앱 아이콘')}<div class="asset-stage">{img('app-icon','app-icon')}</div><p>작은 화면에서도 알아보는 우가</p></article>
    <article class="tile identity">{title('Profile / Avatar','프로필 아이콘')}<div class="asset-stage">{img('avatar-calm','profile-icon')}</div><p>함께 기록하는 우리</p></article>
    <article class="tile identity">{title('Monochrome Icon','단색 아이콘')}<div class="asset-stage">{img('monochrome','mono-icon')}</div><p>한 가지 색으로도 같은 얼굴</p></article>
  </div>
  <div class="foundation-grid">
    <article class="tile colors">{title('Color Palette','브랜드 컬러')}<div class="swatches">{swatches}</div></article>
    <article class="tile key-message">{title('Key Message','주요 카피')}<strong>오늘도<br>우가우가!</strong><p>아껴 쓰는 오늘,<br>더 좋아질 우리.</p></article>
    <article class="tile keywords">{title('Brand Keywords','브랜드 키워드')}<div><span>친근한</span><span>똑똑한</span><span>귀여운</span><span>신뢰감</span><span>일상의 동반자</span><span>지속 가능한</span></div></article>
  </div>
  <div class="usage-grid">
    <article class="tile usages">{title('UI Usage Examples','다양한 사용 예시')}<div class="usage-cells">
      <div class="usage-cell"><h3>카드 헤더 일러스트</h3><div class="card-preview">{img('card-header')}<div><strong>이번 달도<br>차곡차곡 기록해요!</strong><p>우리의 오늘이 더 나은 내일로.</p></div></div></div>
      <div class="usage-cell"><h3>배지 / 태그</h3><div class="pick-badge">{img('badge-pick')}</div><p class="usage-caption">작은 라벨에도<br>우가의 온기를</p></div>
      <div class="usage-cell"><h3>버튼 / FAB 아이콘</h3><div class="fab" aria-label="기록하기 예시">{img('icon-bone')}</div><p class="usage-caption">가볍게 시작하는<br>오늘의 기록</p></div>
      <div class="usage-cell"><h3>빈 상태 화면</h3><div class="empty-preview">{img('empty-state')}<strong>아직 기록이 없어요</strong><p>첫 기록부터 함께해요.</p><span class="sample-primary small-button">첫 기록 남기기</span></div></div>
      <div class="usage-cell"><h3>스티커 / 이모지</h3><div class="sticker-mini">{stickers}</div></div>
    </div></article>
    <article class="tile component-examples">{title('Component Examples','컴포넌트 예시')}<div class="sample-profile">{img('app-icon')}<div><strong>우가</strong><span>우리의 가계부</span></div><b>›</b></div><div class="sample-primary">{img('icon-bone')} 지출 기록하기</div><div class="sample-summary">{img('icon-analytics')}<div><span>이번 달 소비</span><strong>320,000원</strong></div><b>›</b></div><div class="sample-nav">{''.join(f'<div class="{"selected" if key=="ledger" else ""}">{img("icon-"+key)}<span>{label}</span></div>' for key,label in [('ledger','가계부'),('assets','자산'),('payments','카드·통장'),('analytics','통계')])}</div></article>
  </div>
  <footer class="board-footer"><strong>우가</strong><span>OUR HOUSEHOLD, A BRIGHTER TOMORROW</span><i></i><span>BRAND SYSTEM · 01</span></footer>
</section>

<section id="ui-board" class="board ui-board" aria-label="우가 UI 규칙과 컴포넌트">
  <header class="system-heading"><div><span class="eyebrow">우가 — 함께 쓰는 인터페이스</span><h2>매일의 기록에, 같은 기준.</h2><p>읽기 쉬운 숫자 · 분명한 행동 · 따뜻한 피드백</p></div>{img('logo-horizontal','horizontal-logo','우가 우리의 가계부')}</header>
  <div class="system-grid">
    <article class="tile type-spec">{title('Typography','글자와 금액')}<div class="type-row"><span>페이지 제목 · 30 / 40</span><h3>우리의 일상</h3></div><div class="type-row"><span>핵심 금액 · 36 / 48</span><strong class="big-number">1,280,000<small>원</small></strong></div><div class="type-row"><span>본문 · 15 / 24</span><p>함께 기록하고, 한눈에 확인해요.</p></div><div class="type-row"><span>보조 정보 · 13 / 20</span><p class="muted">연결된 가계부의 기록도 함께 보여요.</p></div></article>
    <article class="tile">{title('Actions & States','버튼과 상태')}<div class="button-demo"><button class="sample-primary">{img('icon-bone')} 내역 추가</button><button class="sample-secondary">가계부 설정</button><button class="sample-primary sample-hover">호버</button><button class="sample-primary sample-active">누름</button><button class="sample-text">자세히 보기</button><button class="sample-primary sample-focus">키보드 초점</button><button class="sample-primary" disabled>저장 중…</button></div><div class="status-chips"><span class="success">저장했어요</span><span class="warning">확인이 필요해요</span><span class="danger">저장하지 못했어요</span><span class="info">다시 연결 중</span></div><p class="spec-note">주요 행동은 브라운, 선택은 코랄. 상태는 색과 문구를 함께 표시해요.</p></article>
    <article class="tile">{title('Inputs & Selection','입력과 선택')}<div class="field-demo"><label>금액<span class="input-sample">32,000 <span>원</span></span></label><label>내용<span class="input-sample focused">우리의 저녁 식사</span></label><div class="field-pair"><label>날짜<span class="input-sample">2026. 09. 17 <b>▦</b></span></label><label>결제수단<span class="input-sample">우리 카드 <b>⌄</b></span></label></div><div class="sample-tags"><span>생활비 ✓</span><span>외식 ✓</span><span class="neutral">태그 추가 +</span></div></div><p class="spec-note">선택창·달력·태그·파일 선택까지 같은 표면과 초점 규칙을 사용해요.</p></article>
    <article class="tile">{title('Surface & Spacing','표면과 여백')}<div class="surface-demo"><div><span>카드</span><strong>22px</strong><small>곡률</small></div><div><span>컨트롤</span><strong>14px</strong><small>곡률</small></div><div><span>조작 영역</span><strong>44px</strong><small>최소 높이</small></div></div><div class="spacing-scale">{''.join(f'<div><b style="width:{n}px"></b><span>{n}</span></div>' for n in [4,8,12,16,24,32,48])}</div><p class="spec-note">따뜻한 크림 배경, 얕은 그림자와 가는 테두리. 숫자는 고정 폭으로 정렬해요.</p></article>
  </div>
  <div class="open-controls-grid">
    <article class="tile">{title('Open Selection','열린 선택창')}<div class="open-select"><span class="input-sample">결제수단 검색</span><div class="option-selected">우리 카드 <b>✓</b></div><div>생활비 통장</div><div>현금</div></div><p class="spec-note">선택 상태를 체크와 배경으로 함께 표시해요.</p></article>
    <article class="tile">{title('Date Picker','열린 달력')}<div class="calendar-sample"><strong>‹ <span>2026년 9월</span> ›</strong><div>{''.join(f'<span class="{"selected" if n==17 else ""}">{n}</span>' for n in range(13,27))}</div></div><p class="spec-note">선택한 날짜를 진한 브라운으로 구별해요.</p></article>
    <article class="tile">{title('Validation & Files','오류와 파일 선택')}<div class="field-demo"><label>금액<span class="input-sample invalid">0 원</span></label><span class="sample-error">금액을 0원보다 크게 입력해 주세요.</span><div class="input-sample"><strong>파일 선택</strong><span>우리의 기록.xlsx</span></div></div><p class="spec-note">문제와 해결 방법을 입력 가까이에 보여줘요.</p></article>
  </div>
  <div class="system-wide-grid">
    <article class="tile icon-library">{title('Pictograms','기능별 벡터 아이콘')}<div class="icon-set">{iconset}</div><div class="size-demo"><span>실제 크기</span>{img('icon-bone','',width=16)}<span>16</span>{img('icon-bone','',width=20)}<span>20</span>{img('icon-bone','',width=24)}<span>24</span>{img('icon-bone','',width=32)}<span>32px</span>{img('avatar-happy','',width=40)}<span>40px</span>{img('app-icon','',width=32)}<span>32px</span></div></article>
    <article class="tile">{title('Expressions','함께하는 네 가지 표정')}<div class="emoji-set">{''.join(f'<div>{img("avatar-"+key)}<span>{label}</span></div>' for key,label in [('happy','기쁨'),('calm','평온'),('surprise','놀람'),('sleep','휴식')])}</div><p class="spec-note">개인별 표시는 이름과 함께 사용해요. 그림만으로 사람을 구별하지 않아요.</p></article>
  </div>
  <article class="tile pose-library">{title('Character Library','상황별 캐릭터')}<div class="pose-set">{allposes}</div></article>
  <div class="application-rules"><div><strong>브랜드의 자리</strong><p>로고·프로필·빈 상태·기록 안내에서 우가를 만나요.</p></div><div><strong>기록이 먼저</strong><p>핵심 금액과 거래 목록을 가리지 않는 크기로 사용해요.</p></div><div><strong>누구에게나 명확하게</strong><p>장식 이미지는 읽기 순서에서 제외하고 기능에는 이름을 붙여요.</p></div><div><strong>차분한 반응</strong><p>160ms 색상 전환, 동작 줄이기 설정과 키보드 초점을 지켜요.</p></div></div>
  <footer class="board-footer"><strong>우가</strong><span>작은 기록이 만드는 더 나은 내일</span><i></i><span>UI SYSTEM · 02</span></footer>
</section></main></body></html>'''

(HERE/'index.html').write_text(build('../../../public/brand'))
(ROOT/'public/brand/design-system.html').write_text(build('.'))
print('Built brand board and UI board from shared tokens and production SVG assets.')
