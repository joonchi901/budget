import { UgaLogo } from '../brand/Uga';
import { Button, Stack } from '../ui';
import type { Profile } from '../../shared/people';

/** Google sign-in. Opened from a signup link, it says who invited; joining makes you friends. */
export function LoginView({
  onLogin,
  busy = false,
  error,
  invitedBy,
}: {
  onLogin(): void;
  busy?: boolean;
  error?: string;
  invitedBy?: Profile;
}) {
  return (
    <main className="view-login">
      <Stack gap={6} className="view-login-card">
        <h1>
          <UgaLogo variant="primary" size={180} alt="우리의 가계부" />
        </h1>
        <p className="muted">
          {invitedBy
            ? `${invitedBy.name}님이 우가에 초대했어요. 가입하면 바로 친구가 돼요.`
            : '혼자 써도, 함께 써도 좋은 가계부예요.'}
        </p>
        <Button variant="primary" busy={busy} onClick={onLogin}>
          {busy ? '확인하고 있어요' : 'Google로 계속하기'}
        </Button>
        {error && (
          <p className="view-error" role="alert">
            {error}
          </p>
        )}
      </Stack>
    </main>
  );
}
