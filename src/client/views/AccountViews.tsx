import { useState } from 'react';
import { UgaIcon, type UgaIconName } from '../brand/Uga';
import { AvatarPicker } from '../ledger';
import { FullScreenSheet } from '../templates';
import { Button, List, ListRow, SelectField, SelectOption, Stack, TextField } from '../ui';
import type { Id, IsoDate, Ledger } from '../../shared/ledger';
import { HANDLE_RULE, handleProblem, type Profile } from '../../shared/people';

const shortDay = (date: IsoDate) => {
  const [, month, day] = date.split('-').map(Number);
  return `${month}월 ${day}일`;
};

/**
 * My profile (picture, display name, ID) and account actions. The ID changes at most once
 * every 30 days; until then it shows when it can change.
 */
export function AccountView({
  profile,
  email,
  today,
  handleChangeableFrom,
  takenHandle,
  onSave,
  onLogout,
  onLeave,
  onClose,
}: {
  profile: Profile;
  /** The Google account this profile signs in with. */
  email: string;
  today: IsoDate;
  /** The first day the ID may change again. */
  handleChangeableFrom?: IsoDate;
  /** The server's answer when the new ID is already used. */
  takenHandle?: string;
  onSave(profile: Profile): void;
  onLogout(): void;
  onLeave(): void;
  onClose(): void;
}) {
  const [draft, setDraft] = useState(profile);
  const locked = handleChangeableFrom !== undefined && handleChangeableFrom > today;
  const handleError =
    draft.handle === profile.handle
      ? undefined
      : (handleProblem(draft.handle) ??
        (draft.handle === takenHandle ? '이미 쓰는 아이디예요.' : undefined));
  const nameError = draft.name.trim() ? undefined : '표시 이름을 입력해 주세요.';
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  return (
    <FullScreenSheet
      title="내 계정"
      dirty={dirty}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          disabled={!dirty || Boolean(handleError || nameError)}
          onClick={() => onSave({ ...draft, name: draft.name.trim() })}
        >
          저장
        </Button>
      }
    >
      <Stack gap={6}>
        <AvatarPicker
          value={draft.avatar}
          onValueChange={(avatar) => setDraft({ ...draft, avatar })}
        />
        <TextField
          label="표시 이름"
          value={draft.name}
          maxLength={20}
          error={nameError}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <TextField
          label="아이디"
          value={draft.handle}
          disabled={locked}
          autoCapitalize="none"
          hint={
            locked
              ? `${shortDay(handleChangeableFrom!)}부터 바꿀 수 있어요.`
              : `${HANDLE_RULE}. 30일에 한 번 바꿀 수 있어요.`
          }
          error={handleError}
          onChange={(event) =>
            setDraft({ ...draft, handle: event.target.value.trim().toLowerCase() })
          }
        />
        <Stack gap={3}>
          <p className="view-meta">{email} Google 계정으로 로그인했어요.</p>
          <Button onClick={onLogout}>로그아웃</Button>
          <Button variant="plain" className="view-danger" onClick={onLeave}>
            탈퇴
          </Button>
        </Stack>
      </Stack>
    </FullScreenSheet>
  );
}

/**
 * Leaving the service. Ledgers used alone are deleted. A shared ledger this user owns passes to
 * an editor once they accept; without an editor it is deleted. Records written in other people's
 * ledgers stay, credited to "탈퇴한 사용자".
 */
export function LeaveAccountView({
  owned,
  onConfirm,
  onClose,
}: {
  /** Shared ledgers this user owns, with the editors who could take each over. */
  owned: { ledger: Ledger; editors: Profile[] }[];
  /** Who is asked to take over each ledger; null deletes it. */
  onConfirm(transfers: Record<Id, Id | null>): void;
  onClose(): void;
}) {
  const [transfers, setTransfers] = useState<Record<Id, Id | null>>(() =>
    Object.fromEntries(owned.map((item) => [item.ledger.id, item.editors[0]?.id ?? null])),
  );
  const [confirm, setConfirm] = useState(false);
  return (
    <FullScreenSheet
      title="탈퇴"
      onClose={onClose}
      footer={
        <Button
          className="view-danger"
          onClick={() => (confirm ? onConfirm(transfers) : setConfirm(true))}
        >
          {confirm ? '한 번 더 누르면 탈퇴해요' : '탈퇴하기'}
        </Button>
      }
    >
      <Stack gap={6}>
        <p className="muted">
          탈퇴하면 계정과 혼자 쓰던 가계부가 지워져요. 다른 사람 가계부에 적은 내역은 '탈퇴한
          사용자'로 남아요.
        </p>
        {owned.length > 0 && (
          <Stack gap={3}>
            <h3>내가 만든 공유 가계부</h3>
            <p className="view-meta">
              고른 편집 멤버가 수락하면 넘어가요. 넘겨받을 사람이 없으면 함께 지워져요.
            </p>
            <List aria-label="내가 만든 공유 가계부">
              {owned.map(({ ledger, editors }) => (
                <ListRow
                  key={ledger.id}
                  leading={<UgaIcon name={ledger.icon as UgaIconName} size={32} />}
                  title={ledger.name}
                  description={editors.length ? undefined : '편집 멤버가 없어 지워져요'}
                  trailing={
                    editors.length > 0 && (
                      <SelectField
                        aria-label={`${ledger.name} 넘겨받을 사람`}
                        value={transfers[ledger.id] ?? ''}
                        onValueChange={(id) =>
                          setTransfers({ ...transfers, [ledger.id]: String(id) })
                        }
                      >
                        {editors.map((editor) => (
                          <SelectOption key={editor.id} value={editor.id}>
                            {editor.name}
                          </SelectOption>
                        ))}
                      </SelectField>
                    )
                  }
                />
              ))}
            </List>
          </Stack>
        )}
      </Stack>
    </FullScreenSheet>
  );
}
