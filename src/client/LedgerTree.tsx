import { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FolderInput,
  Layers3,
  MoreHorizontal,
} from 'lucide-react';
import type { Bootstrap, Ledger } from '../shared/types';
import { ALL_LEDGERS_ID, ledgerDescendantIds, sortedLedgerChildren } from '../shared/hierarchy';
import { UgaLedgerIcon } from './brand/Uga';
import { Popover } from './Popover';
import type { MoveIntent } from './HierarchyDialog';

export default function LedgerTree({
  data,
  selectedId,
  onNavigate,
  onMove,
  name = '가계부 트리',
}: {
  data: Bootstrap;
  selectedId: string;
  onNavigate(id: string): void;
  onMove(intent: MoveIntent): void;
  name?: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [archived, setArchived] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<{ ledger: Ledger; hierarchyVersion: number } | null>(null);
  const admin = data.user.role === 'admin';
  function drop(parentId: string | null) {
    const original = drag.current;
    drag.current = null;
    setOver(null);
    if (
      !admin ||
      !original ||
      (parentId && ledgerDescendantIds(data.ledgers, original.ledger.id).has(parentId))
    )
      return;
    onMove({ ...original, parentId, beforeId: null, automatic: true });
  }
  function children(parentId: string | null, depth = 0, trail = new Set<string>()) {
    const siblings = sortedLedgerChildren(data.ledgers, parentId);
    return siblings
      .filter((ledger) => archived || !ledger.archived)
      .map((ledger) => {
        if (trail.has(ledger.id)) return null;
        const descendants = sortedLedgerChildren(data.ledgers, ledger.id).filter(
          (child) => archived || !child.archived,
        );
        const expanded = !collapsed.has(ledger.id);
        const index = siblings.findIndex((item) => item.id === ledger.id);
        const intent = (beforeId: string | null): MoveIntent => ({
          ledger,
          hierarchyVersion: data.hierarchyVersion ?? 0,
          parentId: ledger.parentId,
          beforeId,
          automatic: true,
        });
        return (
          <li
            key={ledger.id}
            role="treeitem"
            aria-label={ledger.name}
            aria-level={depth + 1}
            aria-selected={selectedId === ledger.id}
            aria-expanded={descendants.length ? expanded : undefined}
          >
            <div
              className={`ledger-tree-row ${selectedId === ledger.id ? 'active' : ''} ${over === ledger.id ? 'is-drop-target' : ''}`}
              style={{ paddingLeft: Math.min(depth, 6) * 12 }}
              draggable={admin && !ledger.archived}
              onDragStart={(event) => {
                if (!admin) return;
                drag.current = { ledger, hierarchyVersion: data.hierarchyVersion ?? 0 };
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', ledger.id);
              }}
              onDragEnd={() => {
                drag.current = null;
                setOver(null);
              }}
              onDragOver={(event) => {
                if (
                  admin &&
                  drag.current &&
                  !ledger.archived &&
                  !ledgerDescendantIds(data.ledgers, drag.current.ledger.id).has(ledger.id)
                ) {
                  event.preventDefault();
                  setOver(ledger.id);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!ledger.archived) drop(ledger.id);
              }}
            >
              {descendants.length ? (
                <button
                  className="icon-button tree-toggle"
                  aria-label={`${ledger.name} ${expanded ? '접기' : '펼치기'}`}
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(ledger.id)) next.delete(ledger.id);
                      else next.add(ledger.id);
                      return next;
                    })
                  }
                >
                  {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              ) : (
                <span className="tree-indent" />
              )}
              <button
                className="tree-ledger-link"
                onClick={() => onNavigate(ledger.id)}
                aria-current={selectedId === ledger.id ? 'page' : undefined}
              >
                <UgaLedgerIcon value={ledger.icon} size={22} />
                <span>
                  {ledger.name}
                  {ledger.archived ? ' (보관)' : ''}
                </span>
              </button>
              {admin && (
                <div className="tree-actions">
                  <Popover
                    label={`${ledger.name} 관리 메뉴`}
                    matchTriggerWidth={false}
                    preferredWidth={220}
                    trigger={(props) => (
                      <button
                        {...props}
                        className="icon-button"
                        aria-label={`${ledger.name} 관리 메뉴`}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                    )}
                  >
                    {({ close }) => (
                      <div className="tree-action-menu">
                        <button
                          aria-label={`${ledger.name} 위치 변경`}
                          onClick={() => {
                            close();
                            onMove({ ...intent(null), automatic: false });
                          }}
                        >
                          <FolderInput size={16} />
                          위치 변경
                        </button>
                        <button
                          aria-label={`${ledger.name} 위로 이동`}
                          disabled={index === 0}
                          onClick={() => {
                            close();
                            onMove(intent(siblings[index - 1].id));
                          }}
                        >
                          <ArrowUp size={16} />
                          위로 이동
                        </button>
                        <button
                          aria-label={`${ledger.name} 아래로 이동`}
                          disabled={index === siblings.length - 1}
                          onClick={() => {
                            close();
                            onMove(intent(siblings[index + 2]?.id ?? null));
                          }}
                        >
                          <ArrowDown size={16} />
                          아래로 이동
                        </button>
                      </div>
                    )}
                  </Popover>
                </div>
              )}
            </div>
            {descendants.length > 0 && expanded && (
              <ul role="group">{children(ledger.id, depth + 1, new Set([...trail, ledger.id]))}</ul>
            )}
          </li>
        );
      });
  }
  return (
    <div className="ledger-tree">
      <button
        className={`ledger-tree-all ${selectedId === ALL_LEDGERS_ID ? 'active' : ''}`}
        aria-current={selectedId === ALL_LEDGERS_ID ? 'page' : undefined}
        onClick={() => onNavigate(ALL_LEDGERS_ID)}
        onDragOver={(event) => {
          if (admin && drag.current) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          drop(null);
        }}
      >
        <Layers3 size={20} /> 전체 가계부
      </button>
      <ul role="tree" aria-label={name}>
        {children(null)}
      </ul>
      <label className="checkbox tree-archive-toggle">
        <input
          type="checkbox"
          checked={archived}
          onChange={(event) => setArchived(event.target.checked)}
        />
        보관한 가계부 표시
      </label>
      {admin && (
        <p className="tree-help">
          다른 가계부 위로 끌어 하위에 넣거나, 위치 변경 버튼을 사용하세요.
        </p>
      )}
    </div>
  );
}
