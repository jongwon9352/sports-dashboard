import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

// ≤768px에서는 사이드바가 hide-mobile로 숨겨져 내비게이션 수단이 아예 사라진다.
// 메뉴가 3개 그룹 + 하위항목 12개라 하단 탭바에는 담기지 않으므로,
// 같은 Sidebar를 드로어에 그대로 띄워 메뉴 손실 없이 이동할 수 있게 한다.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // 메뉴로 화면을 이동하면 드로어를 닫는다.
  useEffect(() => { setOpen(false); }, [pathname]);

  // 드로어가 열린 동안 뒤 본문이 스크롤되지 않게 하고, Esc로 닫을 수 있게 한다.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        aria-expanded={open}
        className="show-mobile items-center justify-center w-11 h-11 -ml-2 mr-1 rounded-md text-white text-xl flex-shrink-0"
      >
        ☰
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[260px] max-w-[80vw] bg-surface shadow-[var(--shadow-3)] overflow-y-auto">
            <div className="flex justify-end p-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="메뉴 닫기"
                className="w-11 h-11 flex items-center justify-center rounded-md text-text-secondary text-lg"
              >
                ✕
              </button>
            </div>
            <Sidebar inDrawer />
          </div>
        </div>
      )}
    </>
  );
}
