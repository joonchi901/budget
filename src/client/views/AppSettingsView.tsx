import type { ReactNode } from 'react';
import { ChevronRight, CircleUser, Wallet } from 'lucide-react';
import { Screen } from '../templates';
import { List, ListRow } from '../ui';

/** Home's 설정 tab: a menu of app-wide pages, 프로필 and 자산 관리. */
export function AppSettingsView({
  onOpenProfile,
  onOpenAssets,
  current,
  tabBar,
}: {
  onOpenProfile(): void;
  onOpenAssets(): void;
  /** The page open beside this menu on desktop. */
  current?: 'profile' | 'assets';
  /** The app's bottom tabs. */
  tabBar?: ReactNode;
}) {
  return (
    <Screen
      top={
        <div className="view-page-header">
          <h1>설정</h1>
        </div>
      }
      nav={tabBar}
    >
      <List aria-label="설정 메뉴">
        <ListRow
          leading={<CircleUser size={22} />}
          title="프로필"
          description="사진, 표시 이름, 아이디, 로그아웃·탈퇴"
          trailing={<ChevronRight size={18} />}
          current={current === 'profile'}
          onClick={onOpenProfile}
        />
        <ListRow
          leading={<Wallet size={22} />}
          title="자산 관리"
          description="자산 추가·수정, 연동할 가계부"
          trailing={<ChevronRight size={18} />}
          current={current === 'assets'}
          onClick={onOpenAssets}
        />
      </List>
    </Screen>
  );
}
