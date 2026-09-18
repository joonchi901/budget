import { FormBody, Button, Field, FormFooter, CloseButton } from './ui';
import { useEffect, useRef, useState } from 'react';
import type { Bootstrap, MutationResult, UserRole } from '../shared/types';
import { Dialog, useUnsavedGuard } from './components';
import { SelectField, SelectOption } from './SelectField';
import { RequestError, request } from './api';

export default function MemberRoles({
  data,
  onChanged,
  onClose,
}: {
  data: Bootstrap;
  onChanged(): Promise<void>;
  onClose(): void;
}) {
  const [baseline, setBaseline] = useState(data.hierarchyVersion ?? 0);
  // Only user-edited roles are drafts. Untouched fields always show current server roles.
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRole>>({});
  const roles = Object.fromEntries(
    data.users.map((user) => [user.id, draftRoles[user.id] ?? user.role ?? 'user']),
  );
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<{ userId: string; body: unknown } | null>(null);
  const admin = data.user.role === 'admin';
  const dirtyUsers = data.users.filter((user) => roles[user.id] !== (user.role ?? 'user'));
  const dirty = dirtyUsers.length > 0;
  const adminCount = data.users.filter((user) => user.role === 'admin').length;
  useUnsavedGuard(busy || uncertain || dirty);
  useEffect(() => {
    setDraftRoles((previous) => {
      const next = Object.fromEntries(
        Object.entries(previous).filter(([id, role]) => {
          const current = data.users.find((user) => user.id === id);
          return current && role !== (current.role ?? 'user');
        }),
      );
      return Object.keys(next).length === Object.keys(previous).length ? previous : next;
    });
    // A pristine form follows live revisions; edited drafts retain their conflict guard.
    if (!dirty && !busy && !uncertain && !conflict) setBaseline(data.hierarchyVersion ?? 0);
  }, [data.users, data.hierarchyVersion, dirty, busy, uncertain, conflict]);
  function selectRole(userId: string, role: UserRole) {
    setDraftRoles((previous) => {
      const next = { ...previous };
      if (role === (data.users.find((user) => user.id === userId)?.role ?? 'user'))
        delete next[userId];
      else next[userId] = role;
      return next;
    });
  }
  async function save(userId: string) {
    if ((!admin && !pending.current) || busy || conflict) return;
    if (
      !pending.current &&
      roles[userId] === 'user' &&
      adminCount <= 1 &&
      data.users.find((user) => user.id === userId)?.role === 'admin'
    ) {
      setError('다른 구성원에게 관리자 권한을 먼저 저장해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    pending.current ??= {
      userId,
      body: {
        mutationId: crypto.randomUUID(),
        role: roles[userId],
        expectedHierarchyVersion: baseline,
      },
    };
    try {
      const savedUserId = pending.current.userId;
      const result = await request<MutationResult>(
        `/api/users/${savedUserId}/role`,
        'PATCH',
        pending.current.body,
      );
      pending.current = null;
      setUncertain(false);
      await onChanged();
      setDraftRoles((previous) => {
        const next = { ...previous };
        delete next[savedUserId];
        return next;
      });
      if (dirtyUsers.some((user) => user.id !== savedUserId)) {
        setBaseline(result.hierarchyVersion ?? baseline + 1);
        setNotice('권한을 저장했어요. 다른 구성원의 작성 중인 변경도 이어서 저장할 수 있어요.');
      } else onClose();
    } catch (reason) {
      setError((reason as Error).message);
      if (reason instanceof RequestError && reason.status > 0 && reason.status < 500) {
        pending.current = null;
        setUncertain(false);
        if (reason.status === 409) setConflict(true);
        await onChanged();
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="구성원 권한"
      subtitle="관리자는 가계부 구조와 구성원 권한을 관리해요."
      onClose={onClose}
      locked={busy || uncertain}
      dirty={dirty}
    >
      <FormBody>
        <p className="small muted">
          일반 사용자도 모든 가계부를 보고 수입·지출, 자산, 카드, 계획을 편집할 수 있어요. 관리자는
          최소 한 명 유지해야 해요.
        </p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {!admin && <p role="status">현재 계정은 일반 사용자예요. 관리자용 변경 기능을 닫았어요.</p>}
        {conflict && (
          <div className="alert" role="status">
            <p>
              권한 또는 가계부 구조가 변경됐어요. 아래 최신 권한을 확인한 뒤 선택한 변경을 다시
              적용해 주세요.
            </p>
            <Button
              variant="secondary"
              disabled={!admin}
              onClick={() => {
                setBaseline(data.hierarchyVersion ?? 0);
                setConflict(false);
                setError('');
              }}
            >
              최신 권한을 확인했어요
            </Button>
          </div>
        )}
        {data.users.map((user) => (
          <div className="member-role-row" key={user.id}>
            <div>
              <strong>{user.name}</strong>
              <p className="small muted">현재 {user.role === 'admin' ? '관리자' : '일반 사용자'}</p>
            </div>
            <Field>
              <span className="sr-only">{user.name} 권한</span>
              <SelectField
                value={roles[user.id]}
                disabled={!admin || busy || uncertain}
                onValueChange={(role) => selectRole(user.id, role as UserRole)}
              >
                <SelectOption value="admin">관리자</SelectOption>
                <SelectOption value="user" disabled={user.role === 'admin' && adminCount <= 1}>
                  일반 사용자
                </SelectOption>
              </SelectField>
            </Field>
            <Button
              variant="secondary"
              disabled={
                (!admin && !uncertain) ||
                busy ||
                conflict ||
                (!uncertain &&
                  user.role === 'admin' &&
                  adminCount <= 1 &&
                  roles[user.id] === 'user') ||
                (user.id === data.user.id &&
                  roles[user.id] === 'user' &&
                  dirtyUsers.some((other) => other.id !== user.id)) ||
                (!uncertain && roles[user.id] === user.role) ||
                (uncertain && pending.current?.userId !== user.id)
              }
              onClick={() => void save(user.id)}
            >
              {uncertain && pending.current?.userId === user.id
                ? '변경 결과 다시 확인'
                : `${user.name} 권한 저장`}
            </Button>
            {user.role === 'admin' && adminCount <= 1 && (
              <p className="small muted member-role-help">
                다른 구성원을 관리자로 저장한 뒤 이 권한을 변경할 수 있어요.
              </p>
            )}
            {user.id === data.user.id &&
              roles[user.id] === 'user' &&
              dirtyUsers.some((other) => other.id !== user.id) && (
                <p className="small muted member-role-help">
                  내 관리자 권한을 변경하기 전에 다른 구성원의 변경을 먼저 저장해 주세요.
                </p>
              )}
          </div>
        ))}
      </FormBody>
      <FormFooter>
        <CloseButton variant="secondary" disabled={busy || uncertain}>
          닫기
        </CloseButton>
      </FormFooter>
    </Dialog>
  );
}
