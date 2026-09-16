# 부부 2인 운영 로그인 설정

현재 소스는 Google OpenID Connect의 Authorization Code 로그인과 서버 세션을 제공한다. 로컬 mock issuer 검증과 실제 Google·Cloudflare 계정 연결은 구분한다. **실제 OAuth 클라이언트·비밀값·운영 D1·공개 주소를 아직 설정하거나 배포하지 않았다.**

## 로그인 방식

1. 화면의 Google 로그인 버튼은 `/api/auth/oidc/start`로 이동한다.
2. 서버는 10분 동안 유효한 state·nonce·S256 PKCE를 만들고, state를 현재 브라우저의 보안 쿠키에 결합한다.
3. Google 응답은 `/api/auth/oidc/callback`에서 처리한다. state는 토큰 교환 전에 원자적으로 한 번만 사용한다.
4. Google 공개 키로 RS256 서명·발급자·client ID·만료·발급 시각·nonce·확인된 이메일·authorized party를 검증한다.
5. 사전 등록한 두 이메일만 최초 연결할 수 있다. 이후 사용자는 `https://accounts.google.com + sub`로 고정하며 이메일만 같다는 이유로 다른 Google 계정에 권한을 넘기지 않는다.
6. 브라우저에는 임의 앱 세션을 발급하고 DB에는 해시만 저장한다. Google access/refresh token은 저장하거나 금융 API에 사용하지 않는다.

Google 클라이언트와 callback 등록, 서버 흐름, ID token과 `sub`의 역할은 [Google 공식 OIDC 문서](https://developers.google.com/identity/openid-connect/openid-connect)를 따른다. S256 verifier/challenge는 [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)의 방식이다. JWT 검증은 [jose 공식 구현](https://github.com/panva/jose)을 사용한다.

## 필요한 운영 값

| 값 | 설정 내용 |
| --- | --- |
| `APP_ORIGIN` | 최종 HTTPS origin. 예: `https://budget.example.com`. 끝 `/`와 경로를 붙이지 않음 |
| `GOOGLE_CLIENT_ID` | Google Cloud의 웹 애플리케이션 OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | 같은 OAuth client의 secret |
| `AUTH_ALLOWED_EMAILS` | 정확히 서로 다른 두 이메일을 쉼표로 구분. 첫 번째가 `u1`, 두 번째가 `u2` |
| `DEMO_MODE` | 운영에서는 미설정 또는 `false` |

이메일 목록과 비밀값은 정적 웹 번들에 포함하지 않는다. 운영 Worker에는 `wrangler secret put APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_ALLOWED_EMAILS`로 각각 설정한다. 실제 값을 명령 인수나 소스 파일에 넣지 않는다. `GET /api/config`는 `demoEnabled`, `oidcEnabled`, `mode`만 공개한다.

## 운영 연결 순서

1. 현재 placeholder와 다른 **운영용 D1**을 만들고 해당 database ID를 배포 설정에 지정한다. 개발 DB와 분리한다.
2. 운영 D1에 전체 migration을 순서대로 적용한다. 운영에 `seeds/demo.sql`을 실행하지 않는다.
3. 최종 Worker/사용자 지정 도메인을 정하고 HTTPS origin을 확정한다. 임시 preview 호스트는 허용 origin으로 자동 취급하지 않는다.
4. Google Cloud에서 웹 애플리케이션 OAuth client와 동의 화면을 구성한다. 승인된 redirect URI에 `APP_ORIGIN + /api/auth/oidc/callback`을 정확히 등록한다. 테스트 상태로 운영할 경우 두 계정을 테스트 사용자로 등록한다.
5. 위 네 값을 Worker secrets에 설정하고 `DEMO_MODE`를 제거한다.
6. 빌드·migration·배포 후 두 실제 계정으로 각각 로그인해 같은 빈 가계부를 보는지 확인한다. 다른 계정과 직접 `/api/auth/demo` 접근은 거절되어야 한다.
7. 한 기기에서 수정한 내역을 다른 기기에서 확인하고 로그아웃·세션 만료·재접속을 검증한다. 이 단계의 실제 결과를 운영 검증 기록에 별도로 남긴다.

첫 허용 로그인이 완료되면 가구 `home`, 사용자 `u1/u2`, 예산 0원의 메인 가계부 `main`, 기본 현금 결제수단을 초기화한다. 가상 자산·거래·카드는 만들지 않는다. 최초 사용자 표시명은 나/와이프이며 금융 데이터와 별개다. 이미 다른 가구 사용자 구성이 있는 DB는 자동으로 덮어쓰지 않고 초기 설정 오류로 차단한다.

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

남은 외부 값은 **두 사람의 Google 이메일, OAuth client ID/secret, 운영 D1 ID, 최종 HTTPS 주소**다. 이 값으로 실제 연결을 마친 뒤 운영 검증을 진행해야 한다. 로그인 실패 시에는 인증 정보 대신 안전한 오류 설명과 다시 로그인 경로를 보여준다.
