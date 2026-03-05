import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  onNavigate: (view: string) => void;
}

export default function Navbar({ onNavigate }: NavbarProps) {
  const { user, logout, isAdmin } = useAuth();

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => onNavigate(isAdmin ? 'admin' : 'dashboard')}
      >
        <span className="text-2xl">🎓</span>
        <span className="font-bold text-xl tracking-tight text-blue-600">
          ZrozumTo
        </span>
      </div>
      {user && (
        <div className="flex items-center gap-4">
          {isAdmin && (
            <button
              onClick={() => onNavigate('admin')}
              className="text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 py-1.5 px-3 rounded-lg font-medium transition"
            >
              Panel Admin
            </button>
          )}
          <span className="text-sm text-gray-500">{user.username}</span>
          <button
            onClick={logout}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Wyloguj
          </button>
        </div>
      )}
    </nav>
  );
}
