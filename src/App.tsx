import { Routes, Route } from 'react-router-dom';
import { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { useVocabulary } from '@/hooks/useVocabulary';
import { useToast } from '@/hooks/useToast';
import { useAuth, AuthProvider } from '@/hooks/useAuth';
import { useGoogleSheet } from '@/hooks/useGoogleSheet';
import { useGithubUserSync } from '@/hooks/useGithubUserSync';
import { Sidebar } from '@/components/Sidebar';
import { MobileNav } from '@/components/MobileNav';
import { ToastContainer } from '@/components/ToastContainer';
import { Dashboard } from '@/pages/Dashboard';
import { WordList } from '@/pages/WordList';
import { Favorites } from '@/pages/Favorites';
import { LevelJourney } from '@/pages/LevelJourney';
import { StudyLayout } from '@/pages/StudyLayout';
import { Flashcards } from '@/pages/Flashcards';
import { Quiz } from '@/pages/Quiz';
import { Matching } from '@/pages/Matching';
import { Spelling } from '@/pages/Spelling';
import { Settings } from '@/pages/Settings';
import { Profile } from '@/pages/Profile';
import { AuthPage } from '@/pages/AuthPage';
import { AdminPanel } from '@/pages/AdminPanel';
import { UserDashboard } from '@/pages/UserDashboard';
import { PreTest } from '@/pages/PreTest';

interface AppContextType {
  vocabulary: ReturnType<typeof useVocabulary>;
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => string;
  gsheet: ReturnType<typeof useGoogleSheet>;
  githubSync: ReturnType<typeof useGithubUserSync>;
}

export const AppContext = createContext<AppContextType | null>(null);
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

function AppInner() {
  const { currentUser, isAuthenticated, isLoading } = useAuth();
  const vocabulary = useVocabulary(currentUser?.dataKey);
  const { toasts, addToast, removeToast } = useToast();
  const gsheet = useGoogleSheet();
  const githubSync = useGithubUserSync();

  // Track previous auth state to fire effects only on login transition
  const prevAuthRef = useRef(false);

  // On login: merge shared Google Sheet words + pull vocab from GitHub
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    if (prevAuthRef.current) return; // already ran for this session
    prevAuthRef.current = true;

    // Merge Google Sheet shared words (cached in localStorage)
    const shared = gsheet.getSharedWords();
    if (shared.length > 0) {
      vocabulary.mergeSharedWords(shared);
    }

    // Pull vocab from GitHub in background (cross-device sync)
    githubSync.pullVocab(currentUser.id).then(r => {
      if (r.success && r.data?.words && r.data.words.length > 0) {
        vocabulary.mergeSharedWords(r.data.words);
      }
    }).catch(() => {/* silent — GitHub not configured yet */});

  }, [isAuthenticated, currentUser?.id]); // eslint-disable-line

  // Reset prevAuthRef when user logs out
  useEffect(() => {
    if (!isAuthenticated) prevAuthRef.current = false;
  }, [isAuthenticated]);

  // Auto-sync listener (Google Sheet interval events)
  useEffect(() => {
    const handler = () => {
      gsheet.syncNow((words) => vocabulary.mergeSharedWords(words));
    };
    window.addEventListener('moe-gsheet-autosync', handler);
    return () => window.removeEventListener('moe-gsheet-autosync', handler);
  }, []); // eslint-disable-line

  // Auto-push vocab to GitHub when words change (debounced 10s)
  // Only runs when authenticated and words are loaded
  useEffect(() => {
    if (!currentUser || !isAuthenticated || vocabulary.words.length === 0) return;
    githubSync.schedulePush(currentUser.id, vocabulary.words, vocabulary.sessions);
  }, [vocabulary.words.length, currentUser?.id, isAuthenticated]); // eslint-disable-line

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 border-[3px] border-[#1A1A2E]/20 border-t-[#1A1A2E] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <AuthPage />;

  return (
    <AppContext.Provider value={{ vocabulary, addToast, gsheet, githubSync }}>
      <div className="flex h-screen w-screen overflow-hidden bg-background dot-grid-bg">
        <div className="sidebar-desktop hidden md:block">
          <Sidebar profile={vocabulary.profile} currentStreak={vocabulary.profile.currentStreak} />
        </div>
        <main className="flex-1 overflow-y-auto main-content">
          <div className="mx-auto max-w-[960px] px-4 py-6 md:px-8 md:py-8 main-content-mobile-pad md:pb-8">
            <Routes>
              <Route path="/"              element={<Dashboard />} />
              <Route path="/words"         element={<WordList />} />
              <Route path="/favorites"     element={<Favorites />} />
              <Route path="/pretest"       element={<PreTest />} />
              <Route path="/study"         element={<StudyLayout />}>
                <Route path="level"        element={<LevelJourney />} />
                <Route path="flashcards"   element={<Flashcards />} />
                <Route path="quiz"         element={<Quiz />} />
                <Route path="matching"     element={<Matching />} />
                <Route path="spelling"     element={<Spelling />} />
              </Route>
              <Route path="/settings"      element={<Settings />} />
              <Route path="/profile"       element={<Profile />} />
              <Route path="/my-account"    element={<UserDashboard />} />
              {currentUser?.role === 'admin' && (
                <Route path="/admin" element={<AdminPanel />} />
              )}
            </Routes>
          </div>
        </main>
        <MobileNav />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    </AppContext.Provider>
  );
}

export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>;
}
