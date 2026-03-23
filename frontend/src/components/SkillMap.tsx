import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../api/client';
import MathContent from './MathContent';
import Spinner from './Spinner';

interface SkillMastery {
  level: number;
  attempts: number;
  status: 'mastered' | 'in_progress' | 'available' | 'locked';
}

interface UmiejetnoscNode {
  id: string;
  opis: string;
  dzial_id: number;
}

interface WymagaEdge {
  from: string;
  to: string;
}

interface DzialInfo {
  id: number;
  nazwa: string;
}

interface SkillMapData {
  dzialy: DzialInfo[];
  umiejetnosci: UmiejetnoscNode[];
  wymaga_edges: WymagaEdge[];
  mastery: Record<string, SkillMastery>;
}

interface SkillMapProps {
  onPracticeSkill: (skillId: string) => void;
}

const STATUS_CONFIG = {
  mastered: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    ring: 'ring-green-200',
    dot: 'bg-green-500',
    text: 'text-green-700',
    label: 'Opanowana',
  },
  in_progress: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-300',
    ring: 'ring-yellow-200',
    dot: 'bg-yellow-500',
    text: 'text-yellow-700',
    label: 'W trakcie',
  },
  available: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    ring: 'ring-blue-200',
    dot: 'bg-blue-500',
    text: 'text-blue-700',
    label: 'Dostępna',
  },
  locked: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    ring: 'ring-gray-100',
    dot: 'bg-gray-400',
    text: 'text-gray-500',
    label: 'Zablokowana przez nauczyciela',
  },
};

export default function SkillMap({ onPracticeSkill }: SkillMapProps) {
  const [data, setData] = useState<SkillMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [expandedDzialy, setExpandedDzialy] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiGet<SkillMapData>('/tasks/skill-map');
      setData(d);
      setExpandedDzialy(new Set(d.dzialy.map(dz => dz.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać mapy umiejętności.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleDzial(id: number) {
    setExpandedDzialy(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { dzialy, umiejetnosci, wymaga_edges, mastery } = data;

  const prereqSet = new Set(wymaga_edges.map(e => `${e.from}->${e.to}`));
  const skillsByDzial = new Map<number, UmiejetnoscNode[]>();
  for (const u of umiejetnosci) {
    const arr = skillsByDzial.get(u.dzial_id) || [];
    arr.push(u);
    skillsByDzial.set(u.dzial_id, arr);
  }

  const counts = { mastered: 0, in_progress: 0, available: 0, locked: 0 };
  for (const u of umiejetnosci) {
    const s = mastery[u.id]?.status ?? 'locked';
    counts[s]++;
  }
  const total = umiejetnosci.length;

  const selected = selectedSkill ? umiejetnosci.find(u => u.id === selectedSkill) : null;
  const selectedMastery = selectedSkill ? mastery[selectedSkill] : null;
  const selectedPrereqs = selectedSkill
    ? wymaga_edges.filter(e => e.from === selectedSkill).map(e => {
        const node = umiejetnosci.find(u => u.id === e.to);
        return node ? { id: node.id, opis: node.opis, mastery: mastery[node.id] } : null;
      }).filter(Boolean) as { id: string; opis: string; mastery?: SkillMastery }[]
    : [];
  const selectedDependents = selectedSkill
    ? wymaga_edges.filter(e => e.to === selectedSkill).map(e => {
        const node = umiejetnosci.find(u => u.id === e.from);
        return node ? { id: node.id, opis: node.opis } : null;
      }).filter(Boolean) as { id: string; opis: string }[]
    : [];

  return (
    <div>
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        {(Object.entries(STATUS_CONFIG) as [keyof typeof STATUS_CONFIG, typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(
          ([key, cfg]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
              <span className="text-gray-600">
                {cfg.label}: <strong>{counts[key]}</strong>
              </span>
            </div>
          ),
        )}
        <div className="text-sm text-gray-400 ml-auto">
          {total} umiejętności
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-6">
        <div className="h-full flex">
          {total > 0 && (
            <>
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${(counts.mastered / total) * 100}%` }}
              />
              <div
                className="bg-yellow-400 transition-all"
                style={{ width: `${(counts.in_progress / total) * 100}%` }}
              />
              <div
                className="bg-blue-400 transition-all"
                style={{ width: `${(counts.available / total) * 100}%` }}
              />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Skill tree */}
        <div className="flex-1 space-y-4 min-w-0">
          {dzialy.map(dzial => {
            const skills = skillsByDzial.get(dzial.id) || [];
            if (skills.length === 0) return null;
            const isExpanded = expandedDzialy.has(dzial.id);

            const dzialMastered = skills.filter(
              s => mastery[s.id]?.status === 'mastered',
            ).length;

            return (
              <div key={dzial.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleDzial(dzial.id)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-bold text-gray-800 truncate">
                      {dzial.nazwa}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {dzialMastered}/{skills.length}
                    </span>
                  </div>
                  <span className="text-gray-400 text-sm flex-shrink-0">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {/* Dzial progress bar */}
                <div className="h-1 bg-gray-100">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{
                      width: skills.length > 0
                        ? `${(dzialMastered / skills.length) * 100}%`
                        : '0%',
                    }}
                  />
                </div>

                {isExpanded && (
                  <div className="p-3 grid gap-2 sm:grid-cols-2">
                    {skills.map(skill => {
                      const m = mastery[skill.id];
                      const status = m?.status ?? 'locked';
                      const cfg = STATUS_CONFIG[status];
                      const isSelected = selectedSkill === skill.id;
                      const hasPrereqs = wymaga_edges.some(e => e.from === skill.id);

                      return (
                        <button
                          key={skill.id}
                          onClick={() =>
                            setSelectedSkill(isSelected ? null : skill.id)
                          }
                          className={`text-left px-3 py-2.5 rounded-lg border transition text-sm ${cfg.bg} ${cfg.border} ${
                            isSelected ? `ring-2 ${cfg.ring}` : ''
                          } hover:shadow-sm`}
                        >
                          <div className="flex items-start gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${cfg.dot}`} />
                            <div className="min-w-0 flex-1">
                              <MathContent>
                                <span className={`font-medium ${cfg.text} line-clamp-2`}>
                                  {skill.opis}
                                </span>
                              </MathContent>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-gray-400">
                                  {cfg.label}
                                </span>
                                {m && m.attempts > 0 && (
                                  <span className="text-[10px] text-gray-400">
                                    · {m.attempts} {m.attempts === 1 ? 'próba' : 'prób'}
                                  </span>
                                )}
                                {m && m.level > 0 && (
                                  <span className="text-[10px] text-gray-400">
                                    · {Math.round(m.level * 100)}%
                                  </span>
                                )}
                                {hasPrereqs && (
                                  <span className="text-[10px] text-gray-400">· wymaga</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Skill detail panel */}
        {selected && selectedMastery !== undefined && (
          <div className="lg:w-80 flex-shrink-0">
            <div className="sticky top-4 border border-gray-200 rounded-xl p-5 bg-white shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`w-3 h-3 rounded-full ${STATUS_CONFIG[selectedMastery?.status ?? 'locked'].dot}`}
                />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {STATUS_CONFIG[selectedMastery?.status ?? 'locked'].label}
                </span>
              </div>

              <MathContent>
                <h3 className="text-base font-bold text-gray-900 mb-2">
                  {selected.opis}
                </h3>
              </MathContent>

              {selectedMastery && (
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Opanowanie</span>
                    <span className="font-semibold text-gray-800">
                      {Math.round(selectedMastery.level * 100)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full transition-all rounded-full ${
                        selectedMastery.level >= 0.7
                          ? 'bg-green-500'
                          : selectedMastery.level > 0
                            ? 'bg-yellow-400'
                            : 'bg-gray-300'
                      }`}
                      style={{ width: `${Math.round(selectedMastery.level * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Próby</span>
                    <span className="font-semibold text-gray-800">
                      {selectedMastery.attempts}
                    </span>
                  </div>
                </div>
              )}

              {/* Prerequisites */}
              {selectedPrereqs.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Wymaga
                  </p>
                  <div className="space-y-1">
                    {selectedPrereqs.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedSkill(p.id)}
                        className="w-full text-left flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-gray-50 transition"
                      >
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            STATUS_CONFIG[p.mastery?.status ?? 'locked'].dot
                          }`}
                        />
                        <MathContent>
                          <span className="text-gray-700 line-clamp-1">{p.opis}</span>
                        </MathContent>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Dependents */}
              {selectedDependents.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Odblokuje
                  </p>
                  <div className="space-y-1">
                    {selectedDependents.map(d => (
                      <button
                        key={d.id}
                        onClick={() => setSelectedSkill(d.id)}
                        className="w-full text-left flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-gray-50 transition"
                      >
                        <span className="text-gray-400">→</span>
                        <MathContent>
                          <span className="text-gray-700 line-clamp-1">{d.opis}</span>
                        </MathContent>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Practice button */}
              {(selectedMastery?.status === 'available' ||
                selectedMastery?.status === 'in_progress' ||
                selectedMastery?.status === 'mastered') && (
                <button
                  onClick={() => onPracticeSkill(selectedSkill!)}
                  className="w-full bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
                >
                  Ćwicz tę umiejętność
                </button>
              )}

              {selectedMastery?.status === 'locked' && (
                <p className="text-xs text-gray-400 text-center">
                  Zablokowana przez nauczyciela.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
