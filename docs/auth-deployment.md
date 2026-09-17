# 부부 2인 운영 로그인 설정

현재 소스는 Google OpenID Connect의 Authorization Code 로그인과 서버 세션을 제공한다. 로컬 mock issuer 검증과 실제 Google·Cloudflare 계정 연결은 구분한다. **2026-09-17 기준 Cloudflare 운영 배포, Google OAuth client와 Worker secrets 설정, 인증 설정 완료 상태의 공개 접근 차단 검사를 마쳤다. 본인 Google 계정의 로그인·새로고침 유지·로그아웃·재로그인과 실시간 연결을 확인했다. 배우자 계정 로그인과 실제 2인 공동 동작은 아직 확인하지 않았다.**

## 현재 연결 상태

| 항목            | 확인된 상태                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare 계정 | OAuth 로그인과 사용자 이메일 인증 완료                                                                                                                               |
| 운영 D1         | `budget-production`, ID `700713f0-f352-463f-aea1-a05336091a66`, APAC 생성 및 운영 설정 반영                                                                          |
| 운영 스키마     | `0001`~`0011` 원격 migration 적용 완료. 최초 배포 전 조회에서 migration 11개와 빈 가구·사용자·거래·자산·세션 확인                                                    |
| 운영 배포       | 소스 `1cbb067`의 최초 업로드 version `fe1fe4e5-5f00-464c-93c2-179d80bc1470`. 우가 UI 적용 후 현재 활성 version `7036cc3b-5cf6-4332-9975-1b23b5a7f833`                 |
| 공개 HTTPS 주소 | [https://our-budget-production.our-budget.workers.dev](https://our-budget-production.our-budget.workers.dev)                                                         |
| Google OAuth    | 전용 프로젝트 `Our Budget` (`our-budget-508823`)의 `Budget Web` 웹 클라이언트 생성 완료. 운영 callback과 `openid`·`userinfo.email` 범위 저장 확인                    |
| Worker secrets  | 사용자 승인 후 `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_ALLOWED_EMAILS` 네 값 등록 완료                                                       |
| 허용 계정       | 두 사람의 Google 기본 이메일을 수신해 서버 허용목록에 등록. 실제 이메일과 비밀값은 문서·Git에 기록하지 않음                                                          |
| 원격 검증       | 인증 설정 완료 상태의 비로그인 API·백업·WebSocket 차단과 demo 차단 통과. 본인 로그인·실시간 연결·새로고침·로그아웃·재로그인 확인. 배우자 로그인·2인 공동 동작 미확인 |

첫 배포에서 발생했던 Cloudflare 이메일 미인증 오류(`10034`)는 사용자 인증 후 재배포하여 해소했다. 아래 검사는 Google 인증 설정 전 상태를 확인한 결과다.

```sh
npm run check:production -- https://our-budget-production.our-budget.workers.dev --unconfigured
```

- `/`: HTTPS `200`, 웹 앱 HTML 응답.
- `/api/config`: `mode=production`, `demoEnabled=false`, `oidcEnabled=false`.
- `/api/bootstrap`, `/api/data/backup`, `/api/ws`: `503 AUTH_NOT_CONFIGURED`.
- `POST /api/auth/demo`: `404 NOT_FOUND`.

모든 항목을 통과했다. 이 결과는 공개 배포와 인증 미설정 시 접근 차단을 확인한 것이며 Google 로그인이나 인증된 데이터 접근 성공을 뜻하지 않는다.

### 인증 설정 완료 후 검증

사용자 승인으로 OAuth client 생성과 Worker secrets 등록을 완료한 뒤 다음 검사를 실행했다.

```sh
npm run check:production -- https://our-budget-production.our-budget.workers.dev --configured
```

- `/`: HTTPS `200`, 웹 앱 HTML 응답.
- `/api/config`: `mode=production`, `demoEnabled=false`, `oidcEnabled=true`.
- 비로그인 `/api/bootstrap`, `/api/data/backup`, `/api/ws`: `401 UNAUTHENTICATED`.
- `POST /api/auth/demo`: `404 NOT_FOUND`.

공개 검사 전체를 통과했다. Chrome 운영 화면에서 본인 Google 계정으로 로그인하여 메인 가계부와 `실시간 연결됨`을 확인했고, 새로고침 후 로그인 유지, 로그아웃 후 로그인 화면 복귀, 재로그인 후 실시간 연결까지 확인했다.

첫 로그인 후 로그아웃 전의 원격 D1 읽기 전용 조회는 가구 1개, 사용자 2개, 활성 로그인 identity 1개, OIDC 세션 1개, 거래·자산·자산변동 각 0개였다. 이 수치는 해당 시점의 관측값이며 금융 기록을 생성하지 않았다. 사용자 2개는 초기 가구 구성이고 **배우자가 실제 로그인했다는 증거는 아니다.** 배우자 기기의 로그인과 2인 공동 동작은 확인 요청 후 응답 대기 중이다.

## 배포 환경과 명령

`wrangler.jsonc`의 기본 환경은 기존 로컬 `budget-local`을 사용한다. `env.production`은 별도 Worker 이름 `our-budget-production`, DB `budget-production`, `DEMO_MODE=false`, SQLite Durable Object 바인딩을 명시한다. 웹과 API는 하나의 Worker에서 제공하고 `workers.dev`를 사용한다. 버전별 preview URL은 끈다. 환경별 바인딩은 자동 상속되지 않으므로 [Cloudflare 환경 설정](https://developers.cloudflare.com/workers/wrangler/environments/)에 따라 운영 환경에 다시 선언했다.

| 명령                                                          | 역할                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run deploy:preview`                                      | 웹 빌드와 운영 Worker 패키징 검사. `--dry-run`으로 업로드하지 않음       |
| `npm run db:migrate:production`                               | 운영 D1에 migration만 적용. 가상 seed를 실행하지 않음                    |
| `npm run deploy:production`                                   | 웹 빌드 후 `--env production`으로 업로드                                 |
| `npm run check:production -- https://실제주소 --unconfigured` | 초기 배포의 HTTPS·운영 모드·설정 누락 시 데이터 차단·원격 데모 차단 확인 |
| `npm run check:production -- https://실제주소 --configured`   | Google 설정 후 공개 설정과 비로그인 API·백업·WebSocket 차단 확인         |

운영 D1 ID는 생성된 DB의 실제 ID로 반영했다. 기본 로컬 환경의 placeholder와는 구분한다. `deploy:preview` 성공은 계정 권한이나 원격 배포 성공을 뜻하지 않으며, 정적 자산 업로드만으로 Worker 서비스가 실행되는 것도 아니다.

Cloudflare 로그인은 `wrangler login --scopes account:read user:read workers_scripts:write d1:write --use-keyring`으로 시작하고 사용자가 공식 브라우저 화면에서 승인한다. Google client secret과 이메일은 [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)로 등록하며 Git/명령 인수/공개 문서에 쓰지 않는다. 각 `secret put` 명령에도 `--env production`을 지정한다. `.env.*`, `.dev.vars.*`는 예제 파일을 제외하고 Git에서 무시한다.

원격 점검 스크립트는 세션이나 금융 데이터를 입력받지 않고 비로그인 요청만 보낸다. 본인 계정의 실제 로그인·로그아웃은 위 브라우저 검사로 별도 확인했고, 배우자 로그인·2인 공동 편집 검증은 남아 있다.

## 우가 UI 운영 배포 기록 — 2026-09-17

사용자가 운영 배포를 요청한 뒤 현재 작업트리의 우가 디자인시스템과 클라이언트 UI를 `our-budget-production`에 배포했다. 승인된 캐릭터·로고, SVG 38종, 디자인 보드, PC·모바일 UI가 포함된다.

- 이전 활성 version: `e044d481-5d20-4633-8c36-f3f6a5dc189a`.
- 새 활성 version: `7036cc3b-5cf6-4332-9975-1b23b5a7f833`.
- 운영 주소: [우가 · 우리의 가계부](https://our-budget-production.our-budget.workers.dev).
- `deploy:preview` 패키징 후 `deploy:production` 업로드·trigger 배포 완료. 정적 파일 44개를 업로드했다.
- 09:25 KST 원격 검사: 현재 `dist`의 정적 파일 44개 모두 HTTP 200이며 로컬 파일과 SHA-256이 일치했다. 앱 제목은 `우가 · 우리의 가계부`다.
- `check:production --configured` 통과: 운영 모드, Google 설정, 비로그인 API·백업·WebSocket의 401, 원격 demo의 404 유지.
- 비로그인 운영 브라우저에서 PC/390px 로그인 화면과 로고 렌더를 확인했다. 이미지 누락·브라우저 예외·모바일 가로 넘침이 없고 Google 로그인 버튼이 첫 화면에 보인다.
- 검증 자료: `output/playwright/uga-production-verification.json`, `uga-production-desktop.png`, `uga-production-mobile.png`.
- 이번 배포에서 DB migration·seed·금융 자료 입력·Worker secret 변경은 실행하지 않았다. 서버·공유 계산·스키마·의존성 소스 변경도 없다. 실제 Google 로그인과 금융자료를 사용하는 원격 2인 동작을 이번에 다시 시험한 것은 아니다.

기존 암호화된 Wrangler 로그인은 키체인으로 사용했다. 기본 Node 인증서로 갱신 요청이 실패해 macOS 시스템 인증서를 사용하는 아래 환경 설정으로 정상 처리했다. 인증서 검증은 끄지 않았다.

```sh
NODE_USE_SYSTEM_CA=1 CLOUDFLARE_AUTH_USE_KEYRING=true npm run deploy:production
NODE_USE_SYSTEM_CA=1 npm run check:production -- https://our-budget-production.our-budget.workers.dev --configured
```

## 로그인 방식

1. 화면의 Google 로그인 버튼은 `/api/auth/oidc/start`로 이동한다.
2. 서버는 10분 동안 유효한 state·nonce·S256 PKCE를 만들고, state를 현재 브라우저의 보안 쿠키에 결합한다.
3. Google 응답은 `/api/auth/oidc/callback`에서 처리한다. state는 토큰 교환 전에 원자적으로 한 번만 사용한다.
4. Google 공개 키로 RS256 서명·발급자·client ID·만료·발급 시각·nonce·확인된 이메일·authorized party를 검증한다.
5. 사전 등록한 두 이메일만 최초 연결할 수 있다. 이후 사용자는 `https://accounts.google.com + sub`로 고정하며 이메일만 같다는 이유로 다른 Google 계정에 권한을 넘기지 않는다.
6. 브라우저에는 임의 앱 세션을 발급하고 DB에는 해시만 저장한다. Google access/refresh token은 저장하거나 금융 API에 사용하지 않는다.

Google 클라이언트와 callback 등록, 서버 흐름, ID token과 `sub`의 역할은 [Google 공식 OIDC 문서](https://developers.google.com/identity/openid-connect/openid-connect)를 따른다. S256 verifier/challenge는 [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)의 방식이다. JWT 검증은 [jose 공식 구현](https://github.com/panva/jose)을 사용한다.

## 필요한 운영 값

| 값                     | 설정 내용                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `APP_ORIGIN`           | `https://our-budget-production.our-budget.workers.dev`. 끝 `/`와 경로를 붙이지 않음 |
| `GOOGLE_CLIENT_ID`     | Google Cloud의 웹 애플리케이션 OAuth client ID                                      |
| `GOOGLE_CLIENT_SECRET` | 같은 OAuth client의 secret                                                          |
| `AUTH_ALLOWED_EMAILS`  | 정확히 서로 다른 두 이메일을 쉼표로 구분. 첫 번째가 `u1`, 두 번째가 `u2`            |
| `DEMO_MODE`            | 운영에서는 미설정 또는 `false`                                                      |

이메일 목록과 비밀값은 정적 웹 번들에 포함하지 않는다. 운영 Worker에는 `wrangler secret put APP_ORIGIN --env production`과 같은 방식으로 네 값을 각각 설정한다. 실제 값을 명령 인수나 소스 파일에 넣지 않는다. `GET /api/config`는 `demoEnabled`, `oidcEnabled`, `mode`만 공개한다.

Gmail이 아닌 주소로 만든 Google 계정도 사용할 수 있다. 단, 서버는 Google ID token의 `email_verified=true`를 요구하며 `email`과 허용목록을 공백 제거·소문자화 후 정확히 비교한다. 전달 주소, `+` 별칭, 점 생략 등을 같은 주소로 변환하지 않는다. 두 사람의 서로 다른 Google 계정이 실제 반환하는 기본 이메일을 등록해야 한다.

## 운영 연결 순서

1. **완료:** 개발 DB와 분리된 운영용 D1을 생성하고 실제 database ID를 배포 설정에 지정했다.
2. **완료:** 운영 D1에 `0001`~`0011` migration을 순서대로 적용했다. 운영에 `seeds/demo.sql`을 실행하지 않았다.
3. **완료:** 이메일 인증 후 Worker를 배포하고 위 HTTPS origin과 인증 미설정 상태의 공개 접근 차단을 확인했다. 임시 preview 호스트는 허용 origin으로 자동 취급하지 않는다.
4. **완료:** `Budget Web` 웹 클라이언트를 생성하고 `https://our-budget-production.our-budget.workers.dev/api/auth/oidc/callback`과 `openid`·`userinfo.email` 범위를 등록했다.
5. **완료:** 두 사람의 Google 기본 이메일을 수신하고 위 네 값을 Worker secrets에 등록했다. 운영 `DEMO_MODE=false`를 유지한다.
6. **부분 확인:** `--configured` 공개 검사는 통과했고 본인 계정의 메인 가계부 접근·실시간 연결·새로고침 유지·로그아웃·재로그인을 확인했다. 배우자 기기에서 같은 가계부에 로그인하는 확인은 대기 중이다. 제3의 비허용 Google 계정에 대한 실제 운영 로그인 거절은 별도 미검증이며 로컬 인증 테스트로 검증했다.
7. **남음:** 실제 두 기기의 접속·편집 위치·변경 공유, 재접속과 세션 만료를 확인하고 결과를 운영 검증 기록에 남긴다. 금융 기록을 사용하는 공동 편집 검증은 이번 로그인 확인에서 수행하지 않았다.

첫 허용 로그인이 완료되면 가구 `home`, 사용자 `u1/u2`, 예산 0원의 메인 가계부 `main`, 기본 현금 결제수단을 초기화한다. 가상 자산·거래·카드는 만들지 않는다. 최초 사용자 표시명은 나/와이프이며 금융 데이터와 별개다. 이미 다른 가구 사용자 구성이 있는 DB는 자동으로 덮어쓰지 않고 초기 설정 오류로 차단한다.

### 개인용 Google Auth Platform 설정

- **Branding:** 앱 이름, 사용자 지원 이메일과 개발자 연락 이메일을 지정한다. 초기 연결에 로고 업로드나 브랜드 검증을 추가할 필요는 없다. 앱 이름·로고를 동의 화면에 표시하는 브랜드 검증은 로그인 연결과 별개다. [Google 초기 설정](https://support.google.com/cloud/answer/15544987?hl=en), [브랜드 검증](https://support.google.com/cloud/answer/15549049?hl=en)
- **Audience:** 개인 Google 계정 두 개를 사용하는 앱은 `External`로 설정하고 초기에는 `Testing`을 유지할 수 있다. 현재 서버가 요청하는 범위는 `openid email`뿐이므로, Google의 기본 신원정보 범위 예외에 해당한다. **Google 테스트 사용자 등록은 필수가 아니며, 이 범위만 요청할 때는 Testing에 따른 경고와 7일 승인 만료도 적용되지 않는다.** 가계부의 실제 2인 접근 제한은 서버 `AUTH_ALLOWED_EMAILS`가 담당한다. 추가 Google API 범위를 요청하면 이 예외를 다시 확인해야 한다. [Google Audience 예외 조건](https://support.google.com/cloud/answer/15549945?hl=en)
- **Data Access:** `openid`와 `https://www.googleapis.com/auth/userinfo.email`만 지정한다. 이는 서버의 `openid email` 요청에 대응한다. [Google 범위 목록](https://developers.google.com/identity/protocols/oauth2/scopes)
- **Clients:** `Web application` 클라이언트를 만들고 위 callback URI를 정확히 등록한다. 현재 서버 OAuth 흐름에는 Authorized JavaScript origins가 필요하지 않다. 생성 직후 client ID와 secret을 안전하게 저장한다. 최신 Google 콘솔에서는 전체 client secret을 생성 시점에만 표시·다운로드한다. [Google OAuth 클라이언트 설정](https://support.google.com/cloud/answer/15549257?hl=en)
- 부부 2인 개인용 앱은 100명 미만 개인용의 OAuth 검증 면제 대상이다. 이를 앱 세션의 24시간 만료나 서버의 허용 이메일 검사와 혼동하지 않는다. [Google 개인용 검증 면제](https://support.google.com/cloud/answer/13464323?hl=en)

## 세션·접근 제한

- 앱 세션은 24시간의 절대 만료를 사용한다. 사용 중 자동 연장이나 별도 유휴 만료는 제공하지 않는다. 한 달 후 방문 시 다시 로그인한다.
- 앱 쿠키는 `Secure; HttpOnly; SameSite=Strict`, OAuth 왕복용 쿠키는 `Secure; HttpOnly; SameSite=Lax`이며 후자는 10분 후 만료한다.
- 상태 변경과 WebSocket 연결은 Origin을 확인한다. 서버 세션·현재 구성원·identity 활성 상태를 HTTP와 WebSocket 알림 시 다시 검사한다.
- 허용 이메일 설정이 해당 사용자의 현재 연결 이메일과 다르거나 identity를 비활성화하면 기존 세션도 더 이상 데이터에 접근하지 못한다.
- 이메일 순서를 바꾸면 사용자 역할이 바뀌는 것이 아니라 기존 바인딩과 불일치하여 접근이 차단된다. 운영 후에는 순서를 고정한다.
- Google 계정을 실제로 교체하려면 먼저 대상 identity를 비활성화하고 세션을 폐기한 뒤, 소유자 확인 하에 issuer/subject 연결을 다시 설정해야 한다. 단순 이메일 수정만으로 계정 연결을 교체하지 않는다.
- 로그아웃은 앱 세션과 실시간 연결을 폐기한다. Google 자체 계정에서 로그아웃시키지는 않는다.
- 백업/내보내기는 금융 데이터만 대상으로 하고 로그인 세션·OAuth state·identity·비밀값은 포함하지 않는다.

## 확인한 내용과 남은 외부 작업

`tests/server/auth-production.test.ts`는 로컬에서 생성한 RSA 키와 mock Google 응답을 사용한다. 실제 서명 검증, 두 계정 제한, issuer/subject 고정, state 재사용·브라우저 바인딩·PKCE, 잘못된 claim, 원격 demo 세션, 구성원 해제·로그아웃·만료를 검증한다. 테스트가 실제 Google 운영 자격증명이나 원격 배포 성공을 증명하지는 않는다.

운영 D1·스키마·Worker·Google OAuth·secrets 연결과 공개 접근 차단 검증은 완료했다. 본인 계정의 실제 로그인 흐름도 확인했다. 남은 사용자 확인은 **배우자 기기의 로그인과 실제 2인 공동 동작**이며, 원격 장기 미사용·세션 만료와 금융 자료를 사용하는 공동 편집은 아직 검증하지 않았다. 로그인 실패 시에는 인증 정보 대신 안전한 오류 설명과 다시 로그인 경로를 보여준다.

GitHub 원격 반영은 개인 계정 인증 만료로 대기 중이다. 별도 GitHub CLI 프로필의 개인 계정 device flow 승인을 요청했으며, 기존 회사 계정으로 대체하지 않았고 push는 아직 실행하지 않았다. 이 인증은 Cloudflare 운영 배포·Google 로그인 상태와 별개다.
