import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../api/client';
import type { Zadanie, Dzial } from '../types';
import TaskRenderer from '../components/TaskRenderer';
import SkillMap from '../components/SkillMap';
import Spinner from '../components/Spinner';

type Mode = 'recommended' | 'dzial' | 'random' | 'all' | 'skillmap';

interface TasksViewProps {
  onBack: () => void;
}

export default function TasksView({ onBack }: TasksViewProps) {
  const [mode, setMode] = useState<Mode>('recommended');
  const [task, setTask] = useState<Zadanie | null>(null);
  const [tasks, setTasks] = useState<Zadanie[]>([]);
  const [dzialy, setDzialy] = useState<Dzial[]>([]);
  const [selectedDzialId, setSelectedDzialId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDzialy = useCallback(async () => {
    try {
      const data = await apiGet<Dzial[]>('/tasks/dzialy');
      setDzialy(data);
    } catch {
      setError('Nie udało się pobrać działów.');
    }
  }, []);

  const loadRecommended = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Zadanie>('/tasks/recommended');
      setTask(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać zadania.');
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRandom = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Zadanie>('/tasks/random');
      setTask(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać zadania.');
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTasksByDzial = useCallback(async (dzialId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Zadanie[]>(`/tasks/dzial/${dzialId}`);
      setTasks(data);
      setTask(data[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać zadań.');
      setTasks([]);
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Zadanie[]>('/tasks/all?limit=500');
      setTasks(data);
      setTask(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać zadań.');
      setTasks([]);
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDzialy();
  }, [loadDzialy]);

  useEffect(() => {
    if (mode === 'recommended') {
      loadRecommended();
    } else if (mode === 'random') {
      loadRandom();
    } else if (mode === 'all') {
      loadAllTasks();
    } else if (mode === 'skillmap') {
      setTask(null);
      setTasks([]);
    } else if (selectedDzialId !== null) {
      loadTasksByDzial(selectedDzialId);
    } else {
      setTask(null);
      setTasks([]);
    }
  }, [mode, selectedDzialId, loadRecommended, loadRandom, loadAllTasks, loadTasksByDzial]);

  function handleDzialChange(dzialId: number) {
    setSelectedDzialId(dzialId);
    setMode('dzial');
  }

  function handlePrevTask() {
    if (mode === 'all' && tasks.length > 1 && task) {
      const idx = tasks.findIndex(t => t.id === task.id);
      const prevIdx = idx > 0 ? idx - 1 : tasks.length - 1;
      setTask(tasks[prevIdx]);
    }
  }

  function handleNextTask() {
    if ((mode === 'dzial' || mode === 'all') && tasks.length > 1) {
      const idx = tasks.findIndex(t => t.id === task?.id);
      const nextIdx = idx >= 0 && idx < tasks.length - 1 ? idx + 1 : 0;
      setTask(tasks[nextIdx]);
    } else if (mode === 'random') {
      loadRandom();
    } else if (mode === 'all') {
      setTask(null);
    } else {
      loadRecommended();
    }
  }

  async function handlePracticeSkill(skillId: string) {
    setMode('recommended');
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Zadanie>(`/tasks/recommended?skill_id=${encodeURIComponent(skillId)}`);
      setTask(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać zadania.');
      setTask(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 mb-2"
        >
          ← Wróć
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Zadania egzaminacyjne</h1>
        <p className="text-gray-500 text-sm mt-1">
          Ćwicz zadania z egzaminu ósmoklasisty
        </p>
      </header>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => { setMode('recommended'); loadRecommended(); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            mode === 'recommended'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Polecane dla Ciebie
        </button>
        <button
          onClick={() => setMode('random')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            mode === 'random'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Losowe zadanie
        </button>
        <button
          onClick={() => setMode('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            mode === 'all'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Wszystkie zadania
        </button>
        <button
          onClick={() => setMode('skillmap')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            mode === 'skillmap'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Mapa umiejętności
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Wg działu:</span>
          <select
            value={selectedDzialId ?? ''}
            onChange={e => {
              const v = e.target.value ? Number(e.target.value) : null;
              setSelectedDzialId(v);
              if (v) handleDzialChange(v);
            }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
          >
            <option value="">Wybierz dział</option>
            {dzialy.map(d => (
              <option key={d.id} value={d.id}>
                {d.nazwa}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Skill map view */}
      {mode === 'skillmap' && (
        <SkillMap onPracticeSkill={handlePracticeSkill} />
      )}

      {mode !== 'skillmap' && loading && !task && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {mode !== 'skillmap' && !loading && !task && !error && mode !== 'all' && (
        <p className="text-gray-500 py-8">Brak zadań do wyświetlenia.</p>
      )}

      {mode !== 'skillmap' && mode === 'all' && !loading && !task && tasks.length > 0 && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {tasks.map(t => (
            <button
              key={t.id}
              onClick={() => setTask(t)}
              className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition"
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-900">Zadanie {t.numer}</span>
                <span className="text-xs text-gray-500">{t.data}</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{t.id}</p>
              <p className="text-sm text-gray-500 mt-0.5">{t.punkty} pkt</p>
            </button>
          ))}
        </div>
      )}

      {mode !== 'skillmap' && mode === 'all' && !loading && !task && tasks.length === 0 && !error && (
        <p className="text-gray-500 py-8">Brak zadań w bazie.</p>
      )}

      {mode !== 'skillmap' && task && !loading && (
        <div>
          {mode === 'all' && (
            <div className="mb-4 flex items-center justify-between gap-4">
              <button
                onClick={() => setTask(null)}
                className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
              >
                ← Wróć do listy
              </button>
              {tasks.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevTask}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-700 transition"
                    title="Poprzednie zadanie"
                  >
                    ←
                  </button>
                  <span className="text-sm text-gray-500 min-w-[4rem] text-center">
                    {tasks.findIndex(t => t.id === task.id) + 1} / {tasks.length}
                  </span>
                  <button
                    onClick={handleNextTask}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-700 transition"
                    title="Następne zadanie"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          )}
          <TaskRenderer
            key={task.id}
            task={task}
            onNext={handleNextTask}
          />
        </div>
      )}
    </div>
  );
}
