import { ArrowUpRight } from 'lucide-react';
import { UgaLogo, UgaIcon, UgaAvatar, UgaMascot } from './brand/Uga';
import { Button, Stack } from './ui';
export interface SessionScreenProps {
  loading?: boolean;
  demoEnabled?: boolean;
  oidcEnabled?: boolean;
  error?: string;
  busy?: boolean;
  onDemoLogin(user: 'u1' | 'u2'): void;
  loginHref?: string;
}
/** Rendering only. Authentication, allowed accounts and session state stay in App and Worker. */
export default function SessionScreen({
  loading = false,
  demoEnabled = false,
  oidcEnabled = false,
  error = '',
  busy = false,
  onDemoLogin,
  loginHref = '/api/auth/oidc/start',
}: SessionScreenProps) {
  if (loading)
    return (
      <Stack className="loading" role="status">
        <UgaMascot size={104} />
        <p>우리의 기록을 불러오고 있어요…</p>
      </Stack>
    );
  return (
    <div className="login-page">
      <div className="login-art">
        <UgaLogo
          variant="primary"
          size={230}
          className="login-brand-hero"
          alt="우가 · 우리의 가계부"
        />
        <h1>
          우리가 쓰는 오늘,
          <br />더 나은 내일
        </h1>
        <p>
          함께 쓰고, 함께 살펴보는
          <br />
          우리 둘의 가계부.
        </p>
        <div className="login-brand-message">
          <UgaIcon name="sprout" size={28} />
          <span>작은 기록이 큰 변화를 만들어요.</span>
        </div>
        <span className="art-bottom">둘이서 만들어가는 좋은 습관</span>
      </div>
      <main className="login-content">
        <div className="brand">
          <UgaLogo size={180} alt="우가 · 우리의 가계부" />
        </div>
        <span className="demo-chip">{demoEnabled ? '로컬 미리보기' : '우리 둘의 기록'}</span>
        <h2>반가워요.</h2>
        {demoEnabled && (
          <p>
            예시 데이터로 가계부를 둘러보세요.
            <br />각 창에서 다른 사용자를 선택하면 공동 편집을 확인할 수 있어요.
          </p>
        )}
        {oidcEnabled && (
          <a className="primary" href={loginHref}>
            Google 계정으로 로그인
          </a>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {demoEnabled && (
          <div className="login-users">
            <Button variant="plain" disabled={busy} onClick={() => onDemoLogin('u1')}>
              <span className="avatar purple">
                <UgaAvatar mood="happy" size={44} />
              </span>
              <span>
                <strong>나로 시작하기</strong>
                <small>예시 사용자 1</small>
              </span>
              <ArrowUpRight size={19} />
            </Button>
            <Button variant="plain" disabled={busy} onClick={() => onDemoLogin('u2')}>
              <span className="avatar pink">
                <UgaAvatar mood="calm" size={44} />
              </span>
              <span>
                <strong>와이프로 시작하기</strong>
                <small>예시 사용자 2</small>
              </span>
              <ArrowUpRight size={19} />
            </Button>
          </div>
        )}
        <p className="login-note">
          {demoEnabled
            ? '로컬 예시 계정으로 확인하는 개발 환경이에요.'
            : oidcEnabled
              ? '등록된 두 계정만 이 가계부에 접근할 수 있어요.'
              : '운영 로그인 설정이 필요해요. 관리자에게 인증 설정을 요청해 주세요.'}
        </p>
      </main>
    </div>
  );
}
