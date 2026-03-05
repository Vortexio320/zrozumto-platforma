import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import LoginView from './views/LoginView';
import DashboardView from './views/DashboardView';
import LessonView from './views/LessonView';
import AdminView from './views/AdminView';
import type { Lesson } from './types';

type View =
  | { name: 'dashboard' }
  | { name: 'lesson'; lesson: Lesson }
  | { name: 'admin' };

function AppContent() {
  const { user } = useAuth();
  const [view, setView] = useState<View>({ name: 'dashboard' });

  // Set default view when user changes: admin -> admin panel, others -> dashboard
  useEffect(() => {
    if (user?.role === 'admin') {
      setView({ name: 'admin' });
    } else {
      setView({ name: 'dashboard' });
    }
  }, [user?.id, user?.role]);

  if (!user) {
    return (
      <>
        <Navbar onNavigate={() => {}} />
        <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl">
          <LoginView />
        </main>
      </>
    );
  }

  function navigate(viewName: string) {
    if (viewName === 'dashboard') setView({ name: 'dashboard' });
    else if (viewName === 'admin') setView({ name: 'admin' });
  }

  return (
    <>
      <Navbar onNavigate={navigate} />
      <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl">
        {view.name === 'dashboard' && (
          <DashboardView
            onOpenLesson={lesson => setView({ name: 'lesson', lesson })}
          />
        )}
        {view.name === 'lesson' && (
          <LessonView
            lesson={view.lesson}
            onBack={() => setView({ name: 'dashboard' })}
          />
        )}
        {view.name === 'admin' && (
          <AdminView onBack={() => setView({ name: 'dashboard' })} />
        )}
      </main>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
