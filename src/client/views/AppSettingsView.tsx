import type { ReactNode } from 'react';
import { ChevronRight, CircleUser } from 'lucide-react';
import { Screen } from '../templates';
import { List, ListRow } from '../ui';

/** Home's 설정 tab: a menu of app-wide pages, starting with 프로필. */
export function AppSettingsView({
  onOpenProfile,
  tabBar,
}: {
  onOpenProfile(): void;
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
      </List>
    </Screen>
  );
}
