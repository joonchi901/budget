import { useState } from 'react';
import { AvatarPicker } from '../ledger';
import { Button, Checkbox, Field, Stack, TextField } from '../ui';
import { HANDLE_RULE, handleProblem, type Profile } from '../../shared/people';

/**
 * First sign-in: an ID, a display name and an Uga picture, then the terms. Only these three
 * are shown to others. Opened from a signup link, it says who invited.
 */
export function SignupView({
  email,
  suggestedName = '',
  invitedBy,
  takenHandle,
  busy = false,
  onSubmit,
}: {
  /** The Google account being joined with. */
  email: string;
  suggestedName?: string;
  invitedBy?: Profile;
  /** The server's answer when this ID is already used. */
  takenHandle?: string;
  busy?: boolean;
  onSubmit(profile: Pick<Profile, 'handle' | 'name' | 'avatar'>): void;
}) {
  const [handle, setHandle] = useState('');
  const [name, setName] = useState(suggestedName);
  const [avatar, setAvatar] = useState('happy');
  const [agreed, setAgreed] = useState(false);
  const [tried, setTried] = useState(false);
  const handleError =
    handleProblem(handle) ?? (handle === takenHandle ? '이미 쓰는 아이디예요.' : undefined);
  const nameError = name.trim() ? undefined : '표시 이름을 입력해 주세요.';
  return (
    <main className="view-signup">
      <Stack gap={5}>
        <Stack gap={2}>
          <h1>프로필 만들기</h1>
          <p className="muted">{email}로 가입해요.</p>
        </Stack>
        {invitedBy && (
          <p className="view-note">{invitedBy.name}님의 초대예요. 가입하면 바로 친구가 돼요.</p>
        )}
        <AvatarPicker value={avatar} onValueChange={setAvatar} />
        <TextField
          label="아이디"
          value={handle}
          placeholder="예: junsang_26"
          autoCapitalize="none"
          autoComplete="username"
          hint={`${HANDLE_RULE}. 친구가 이 아이디로 나를 찾아요.`}
          error={tried || handle === takenHandle ? handleError : undefined}
          onChange={(event) => setHandle(event.target.value.trim().toLowerCase())}
        />
        <TextField
          label="표시 이름"
          value={name}
          maxLength={20}
          error={tried ? nameError : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <Stack gap={2}>
          <Field className="view-check">
            <Checkbox checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            이용약관과 개인정보 처리방침에 동의해요
          </Field>
          {tried && !agreed && (
            <p className="view-error" role="alert">
              약관에 동의해야 시작할 수 있어요.
            </p>
          )}
        </Stack>
        <Button
          variant="primary"
          busy={busy}
          onClick={() => {
            setTried(true);
            if (!handleError && !nameError && agreed)
              onSubmit({ handle, name: name.trim(), avatar });
          }}
        >
          시작하기
        </Button>
      </Stack>
    </main>
  );
}
