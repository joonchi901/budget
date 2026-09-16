# 부부 2인 운영 로그인 설정

현재 소스는 Google OpenID Connect의 Authorization Code 로그인과 서버 세션을 제공한다. 로컬 mock issuer 검증과 실제 Google·Cloudflare 계정 연결은 구분한다. **2026-09-17 기준 Cloudflare 로그인, 운영 D1 생성과 migration 적용을 완료했다. 첫 배포는 자산 업로드까지 진행했으나 Cloudflare 계정의 이메일 미인증 오류(`10034`)로 Worker 생성에 실패했다. 이메일 인증을 기다리는 중이며 공개 서비스와 Google 로그인은 아직 검증하지 않았다.**

## 현재 연결 상태

| 항목            | 확인된 상태                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare 계정 | OAuth 로그인 성공. 이메일 인증은 사용자 완료 대기                                                                                                 |
| 운영 D1         | `budget-production`, ID `700713f0-f352-463f-aea1-a05336091a66`, APAC 생성 및 운영 설정 반영                                                       |
| 운영 스키마     | `0001`~`0011` 원격 migration 적용 완료. 읽기 전용 조회로 migration 11개, 가구·사용자·거래·자산·세션 0건 확인                                      |
| 첫 배포         | 정적 자산 업로드와 `workers.dev` 계정 하위 도메인 등록 완료. Worker 생성은 오류 `10034`로 실패                                                    |
| 공개 HTTPS 주소 | Worker 배포가 완료되지 않아 실제 서비스 주소 미확정                                                                                               |
| Google OAuth    | 전용 프로젝트 `Our Budget` (`our-budget-508823`) 생성 확인. 앱 정보·대상 입력 후 Google 사용자 데이터 정책 동의 대기. OAuth client·secrets 미설정 |
| 원격 검증       | 공개 주소의 접근 차단 검사, 실제 Google 로그인과 2인 공동 편집 검증 미실시                                                                        |

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

원격 점검 스크립트는 세션이나 금융 데이터를 입력받지 않고 비로그인 요청만 보낸다. 실제 두 사용자 로그인·공동 편집·로그아웃 검증은 별도로 필요하다.

## 로그인 방식

1. 화면의 Google 로그인 버튼은 `/api/auth/oidc/start`로 이동한다.
2. 서버는 10분 동안 유효한 state·nonce·S256 PKCE를 만들고, state를 현재 브라우저의 보안 쿠키에 결합한다.
3. Google 응답은 `/api/auth/oidc/callback`에서 처리한다. state는 토큰 교환 전에 원자적으로 한 번만 사용한다.
4. Google 공개 키로 RS256 서명·발급자·client ID·만료·발급 시각·nonce·확인된 이메일·authorized party를 검증한다.
5. 사전 등록한 두 이메일만 최초 연결할 수 있다. 이후 사용자는 `https://accounts.google.com + sub`로 고정하며 이메일만 같다는 이유로 다른 Google 계정에 권한을 넘기지 않는다.
6. 브라우저에는 임의 앱 세션을 발급하고 DB에는 해시만 저장한다. Google access/refresh token은 저장하거나 금융 API에 사용하지 않는다.

Google 클라이언트와 callback 등록, 서버 흐름, ID token과 `sub`의 역할은 [Google 공식 OIDC 문서](https://developers.google.com/identity/openid-connect/openid-connect)를 따른다. S256 verifier/challenge는 [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)의 방식이다. JWT 검증은 [jose 공식 구현](https://github.com/panva/jose)을 사용한다.

## 필요한 운영 값

| 값                     | 설정 내용                                                                        |
| ---------------------- | -------------------------------------------------------------------------------- |
| `APP_ORIGIN`           | 최종 HTTPS origin. 예: `https://budget.example.com`. 끝 `/`와 경로를 붙이지 않음 |
| `GOOGLE_CLIENT_ID`     | Google Cloud의 웹 애플리케이션 OAuth client ID                                   |
| `GOOGLE_CLIENT_SECRET` | 같은 OAuth client의 secret                                                       |
| `AUTH_ALLOWED_EMAILS`  | 정확히 서로 다른 두 이메일을 쉼표로 구분. 첫 번째가 `u1`, 두 번째가 `u2`         |
| `DEMO_MODE`            | 운영에서는 미설정 또는 `false`                                                   |

이메일 목록과 비밀값은 정적 웹 번들에 포함하지 않는다. 운영 Worker에는 `wrangler secret put APP_ORIGIN --env production`과 같은 방식으로 네 값을 각각 설정한다. 실제 값을 명령 인수나 소스 파일에 넣지 않는다. `GET /api/config`는 `demoEnabled`, `oidcEnabled`, `mode`만 공개한다.

## 운영 연결 순서

1. **완료:** 개발 DB와 분리된 운영용 D1을 생성하고 실제 database ID를 배포 설정에 지정했다.
2. **완료:** 운영 D1에 `0001`~`0011` migration을 순서대로 적용했다. 운영에 `seeds/demo.sql`을 실행하지 않았다.
3. **현재 대기:** Cloudflare 계정 이메일 인증 후 Worker 배포를 다시 실행하고 최종 HTTPS origin을 확정한다. 임시 preview 호스트는 허용 origin으로 자동 취급하지 않는다.
4. Google Cloud에서 웹 애플리케이션 OAuth client와 동의 화면을 구성한다. 승인된 redirect URI에 `APP_ORIGIN + /api/auth/oidc/callback`을 정확히 등록한다. 아래의 개인용 Google 설정을 따른다.
5. 위 네 값을 Worker secrets에 설정하고 운영 `DEMO_MODE=false`를 유지한다.
6. 빌드·migration·배포 후 두 실제 계정으로 각각 로그인해 같은 빈 가계부를 보는지 확인한다. 다른 계정과 직접 `/api/auth/demo` 접근은 거절되어야 한다.
7. 한 기기에서 수정한 내역을 다른 기기에서 확인하고 로그아웃·세션 만료·재접속을 검증한다. 이 단계의 실제 결과를 운영 검증 기록에 별도로 남긴다.

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

운영 D1 생성과 스키마 적용은 완료했다. 남은 선행 작업은 **Cloudflare 계정 이메일 인증과 Worker 재배포**, Google 정책 확인 후 OAuth client 구성이다. 아직 확정할 외부 값은 **두 사람의 Google 이메일, OAuth client ID/secret, 최종 HTTPS 주소**다. 이 값으로 실제 연결을 마친 뒤 공개 주소 접근 차단, 두 사람의 로그인·공동 편집·로그아웃을 검증한다. 로그인 실패 시에는 인증 정보 대신 안전한 오류 설명과 다시 로그인 경로를 보여준다.
