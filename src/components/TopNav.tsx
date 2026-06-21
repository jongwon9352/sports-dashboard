export function TopNav() {
  return (
    <nav className="h-[72px] bg-purple flex items-center px-8 shadow-[var(--shadow-2)] sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
          DH
        </div>
        <span className="text-white font-bold text-lg tracking-tight">
          대전하나시티즌
        </span>
      </div>
      <div
        className="ml-4 text-white/50 text-xs"
        style={{ fontFamily: 'var(--font-data)' }}
      >
        GPS Training Load Dashboard
      </div>
    </nav>
  );
}
