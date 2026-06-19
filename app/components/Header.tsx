import { Link, Form } from "react-router";
import { LayoutDashboard, LogOut, User } from "lucide-react";

interface HeaderProps {
  userName?: string;
}

export function Header({ userName }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          to="/spaces"
          className="flex items-center gap-2 text-indigo-600 font-bold text-lg"
        >
          <LayoutDashboard size={22} />
          Align
        </Link>
        {userName && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 flex items-center gap-1">
              <User size={14} />
              {userName}
            </span>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <LogOut size={14} />
                ログアウト
              </button>
            </Form>
          </div>
        )}
      </div>
    </header>
  );
}
