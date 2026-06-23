import { Link, Form } from "react-router";

interface HeaderProps {
  userName?: string;
}

export function Header({ userName }: HeaderProps) {
  return (
    <header className="bg-[#f9f9f7] border-b-4 border-[#1a1c1b] shadow-[4px_4px_0px_0px_#1a1c1b] sticky top-0 z-50">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/spaces" className="flex items-center gap-2">
          <span className="text-xl font-bold text-[#880069]" style={{ fontFamily: 'Quicksand, sans-serif' }}>
            Align
          </span>
        </Link>
        {userName && (
          <div className="flex items-center gap-3">
            <div className="bg-[#ff71ce] text-[#1a1c1b] text-sm font-bold px-3 py-1.5 rounded-full border-2 border-[#1a1c1b] neo-shadow" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {userName}
            </div>
            <Form method="post" action="/logout">
              <button type="submit" className="text-sm text-[#1a1c1b]/60 hover:text-[#1a1c1b] font-medium" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                ログアウト
              </button>
            </Form>
          </div>
        )}
      </div>
    </header>
  );
}
