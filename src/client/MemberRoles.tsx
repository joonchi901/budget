import { useRef, useState } from 'react';
import type { Bootstrap, UserRole } from '../shared/types';
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
  const [roles, setRoles] = useState(
    Object.fromEntries(data.users.map((user) => [user.id, user.role ?? 'user'])),
  );
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<{ userId: string; body: unknown } | null>(null);
  const admin = data.user.role === 'admin';
  useUnsavedGuard(busy || uncertain);
  async function save(userId: string) {
    if ((!admin && !pending.current) || busy || conflict) return;
    setBusy(true);
    setError('');
    pending.current ??= {
      userId,
      body: {
        mutationId: crypto.randomUUID(),
        role: roles[userId],
        expectedHierarchyVersion: baseline,
      },
    };
    try {
      await request(`/api/users/${pending.current.userId}/role`, 'PATCH', pending.current.body);
      pending.current = null;
      setUncertain(false);
      await onChanged();
      onClose();
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
    >
      <div className="form-body">
        <p className="small muted">
          일반 사용자도 모든 가계부를 보고 수입·지출, 자산, 카드, 계획을 편집할 수 있어요. 관리자는
          최소 한 명 유지해야 해요.
        </p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {!admin && <p role="status">현재 계정은 일반 사용자예요. 관리자용 변경 기능을 닫았어요.</p>}
        {conflict && (
          <div className="alert" role="status">
            <p>
              권한 또는 가계부 구조가 변경됐어요. 아래 최신 권한을 확인한 뒤 선택한 변경을 다시
              적용해 주세요.
            </p>
            <button
              className="secondary"
              disabled={!admin}
              onClick={() => {
                setBaseline(data.hierarchyVersion ?? 0);
                setConflict(false);
                setError('');
              }}
            >
              최신 권한을 확인했어요
            </button>
          </div>
        )}
        {data.users.map((user) => (
          <div className="member-role-row" key={user.id}>
            <div>
              <strong>{user.name}</strong>
              <p className="small muted">현재 {user.role === 'admin' ? '관리자' : '일반 사용자'}</p>
            </div>
            <label>
              <span className="sr-only">{user.name} 권한</span>
              <SelectField
                value={roles[user.id]}
                disabled={!admin || busy || uncertain}
                onValueChange={(role) => setRoles({ ...roles, [user.id]: role as UserRole })}
              >
                <SelectOption value="admin">관리자</SelectOption>
                <SelectOption value="user">일반 사용자</SelectOption>
              </SelectField>
            </label>
            <button
              className="secondary"
              disabled={
                (!admin && !uncertain) ||
                busy ||
                conflict ||
                (!uncertain && roles[user.id] === user.role) ||
                (uncertain && pending.current?.userId !== user.id)
              }
              onClick={() => void save(user.id)}
            >
              {uncertain && pending.current?.userId === user.id
                ? '변경 결과 다시 확인'
                : `${user.name} 권한 저장`}
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
