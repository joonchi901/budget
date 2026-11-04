import type { ReactNode } from 'react';
import { ChevronRight, CircleUser, Wallet } from 'lucide-react';
import { Screen } from '../templates';
import { List, ListRow } from '../ui';

/** Home's 설정 tab: a menu of app-wide pages, 프로필 and 자산 관리. */
export function AppSettingsView({
  onOpenProfile,
  onOpenAssets,
  tabBar,
}: {
  onOpenProfile(): void;
  onOpenAssets(): void;
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
      bottom={tabBar}
    >
      <List aria-label="설정 메뉴">
        <ListRow
          leading={<CircleUser size={22} />}
          title="프로필"
          description="사진, 표시 이름, 아이디, 로그아웃·탈퇴"
          trailing={<ChevronRight size={18} />}
          onClick={onOpenProfile}
        />
        <ListRow
          leading={<Wallet size={22} />}
          title="자산 관리"
          description="자산 추가·수정, 연동할 가계부"
          trailing={<ChevronRight size={18} />}
          onClick={onOpenAssets}
        />
      </List>
    </Screen>
  );
}
