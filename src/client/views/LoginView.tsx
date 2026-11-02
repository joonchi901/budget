import { UgaLogo, UgaMascot } from '../brand/Uga';
import { Button, Stack } from '../ui';

/** Sign-in for the two registered Google accounts. */
export function LoginView({
  onLogin,
  busy = false,
  error,
}: {
  onLogin(): void;
  busy?: boolean;
  error?: string;
}) {
  return (
    <main className="view-login">
      <Stack gap={6} className="view-login-card">
        <UgaLogo variant="primary" size={180} alt="우가" />
        <Stack gap={2}>
          <h1>우리의 가계부</h1>
          <p className="muted">둘이 함께 쓰는 가계부예요. 등록된 Google 계정으로 들어와 주세요.</p>
        </Stack>
        {error && (
          <p className="view-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" busy={busy} onClick={onLogin}>
          {busy ? '확인하고 있어요' : 'Google로 계속하기'}
        </Button>
        <UgaMascot pose="wave" size={96} />
      </Stack>
    </main>
  );
}
