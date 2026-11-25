import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock,
  Users,
  CheckCircle2,
  Search,
  Plus,
  Upload,
  Download,
  Lock,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import PinLock from './components/PinLock';
import { GROUPS, generateSampleStudents } from './data/sampleStudents';
import {
  isFirebaseConfigured,
  subscribeState,
  saveState,
  createInitialState,
} from './lib/storage';

function formatClock(ts) {
  return new Date(ts).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatRemaining(ms) {
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const prefix = ms < 0 ? '+' : '';
  return `${prefix}${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function playSoftChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18); // A5
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Ignore audio restrictions if user hasn't interacted yet
  }
}

export default function App() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem('leaders_art_unlocked') === '1'
  );
  const [appState, setAppState] = useState(() => createInitialState());
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('전체');
  const [rightTab, setRightTab] = useState('active'); // 'active' | 'history' | 'students'
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [syncMode, setSyncMode] = useState(
    isFirebaseConfigured ? 'firebase' : 'local'
  );
  const [syncError, setSyncError] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('초등저');
  const [newDuration, setNewDuration] = useState(50);

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState('');

  const alertedIdsRef = useRef(new Set());

  useEffect(() => {
    const unsub = subscribeState(
      (data) => {
        setAppState({
          students: data.students || [],
          activeSessions: data.activeSessions || [],
          history: data.history || [],
        });
        setSyncError('');
      },
      (err) => {
        setSyncError(err?.message || '동기화 오류');
      },
      (mode) => setSyncMode(mode)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const persist = async (updater) => {
    setAppState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveState(next).catch((err) => setSyncError(err?.message || '저장 실패'));
      return next;
    });
  };

  const activeIds = useMemo(
    () => new Set(appState.activeSessions.map((s) => s.studentId)),
    [appState.activeSessions]
  );

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appState.students.filter((s) => {
      if (groupFilter !== '전체' && s.group !== groupFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q)
      );
    });
  }, [appState.students, groupFilter, search]);

  const enrichedTimers = useMemo(() => {
    return appState.activeSessions
      .map((s) => {
        const student = appState.students.find((st) => st.id === s.studentId) || {
          id: s.studentId,
          name: s.studentId,
          group: '',
        };
        const totalMs = (s.durationMin || 50) * 60 * 1000;
        const elapsedMs = now - s.startTime;
        const remainingMs = totalMs - elapsedMs;
        const progress = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
        return { ...s, student, remainingMs, progress };
      })
      .sort((a, b) => a.remainingMs - b.remainingMs);
  }, [appState.activeSessions, appState.students, now]);

  // Trigger soft chime once when a student reaches 00:00
  useEffect(() => {
    if (!soundEnabled) return;
    enrichedTimers.forEach((item) => {
      if (item.remainingMs <= 0 && !alertedIdsRef.current.has(item.studentId)) {
        alertedIdsRef.current.add(item.studentId);
        playSoftChime();
      }
    });
  }, [enrichedTimers, soundEnabled]);

  const warningCount = enrichedTimers.filter(
    (t) => t.remainingMs > 0 && t.remainingMs <= 10 * 60 * 1000
  ).length;
  const doneCount = enrichedTimers.filter((t) => t.remainingMs <= 0).length;

  const handleCheckIn = (student) => {
    if (activeIds.has(student.id)) return;
    alertedIdsRef.current.delete(student.id);
    persist((prev) => ({
      ...prev,
      activeSessions: [
        ...prev.activeSessions,
        {
          studentId: student.id,
          startTime: Date.now(),
          durationMin: student.defaultMinutes || 50,
          note: '',
        },
      ],
    }));
  };

  const handleAdjustTime = (studentId, deltaMin) => {
    persist((prev) => ({
      ...prev,
      activeSessions: prev.activeSessions.map((s) =>
        s.studentId === studentId
          ? { ...s, durationMin: Math.max(10, (s.durationMin || 50) + deltaMin) }
          : s
      ),
    }));
  };

  const handleUpdateNote = (studentId, note) => {
    persist((prev) => ({
      ...prev,
      activeSessions: prev.activeSessions.map((s) =>
        s.studentId === studentId ? { ...s, note } : s
      ),
    }));
  };

  const handleCheckOut = (studentId) => {
    alertedIdsRef.current.delete(studentId);
    persist((prev) => {
      const session = prev.activeSessions.find((s) => s.studentId === studentId);
      if (!session) return prev;
      const student = prev.students.find((st) => st.id === studentId);
      const endTime = Date.now();
      const stayedMin = Math.max(1, Math.round((endTime - session.startTime) / 60000));
      return {
        ...prev,
        activeSessions: prev.activeSessions.filter((s) => s.studentId !== studentId),
        history: [
          {
            studentId: session.studentId,
            name: student ? student.name : session.studentId,
            group: student ? student.group : '',
            startTime: session.startTime,
            endTime,
            stayedMin,
            note: session.note || '',
          },
          ...prev.history,
        ],
      };
    });
  };

  const handleAddStudent = (e) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    persist((prev) => {
      const nextNum = prev.students.length + 1;
      const id = 'S-' + String(nextNum).padStart(3, '0');
      return {
        ...prev,
        students: [
          { id, name: trimmed, group: newGroup, defaultMinutes: Number(newDuration) || 50 },
          ...prev.students,
        ],
      };
    });
    setNewName('');
    setShowAddModal(false);
  };

  const handleBulkCsvImport = () => {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;

    persist((prev) => {
      let counter = prev.students.length;
      const imported = lines.map((line) => {
        const [rawName, rawGroup, rawMin] = line.split(/[,\t]/).map((v) => v?.trim());
        counter += 1;
        return {
          id: 'S-' + String(counter).padStart(3, '0'),
          name: rawName || `학생${counter}`,
          group: GROUPS.includes(rawGroup) ? rawGroup : rawGroup || '초등저',
          defaultMinutes: parseInt(rawMin, 10) || 50,
        };
      });
      return {
        ...prev,
        students: [...imported, ...prev.students],
      };
    });
    setCsvText('');
    setShowCsvModal(false);
  };

  const handleDeleteStudent = (id) => {
    persist((prev) => ({
      ...prev,
      students: prev.students.filter((s) => s.id !== id),
      activeSessions: prev.activeSessions.filter((s) => s.studentId !== id),
    }));
  };

  const handleResetSamples = () => {
    persist((prev) => ({
      ...prev,
      students: generateSampleStudents(200),
    }));
  };

  const handleExportHistoryCsv = () => {
    const header = '고유번호,이름,반,등원시각,하원시각,수업시간(분),메모\n';
    const rows = appState.history
      .map(
        (h) =>
          `${h.studentId},${h.name},${h.group},${formatClock(h.startTime)},${formatClock(
            h.endTime
          )},${h.stayedMin},${(h.note || '').replace(/,/g, ' ')}`
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `리더스아트_출석기록_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!unlocked) {
    return <PinLock onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
                🎨 리더스아트 50분 출석부
              </h1>
              {syncMode === 'wifi-server' ? (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                  <Wifi className="w-3.5 h-3.5" /> 학원 와이파이 서버 연결됨
                </span>
              ) : syncMode === 'firebase' ? (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                  <Wifi className="w-3.5 h-3.5" /> 실시간 클라우드 동기화 중
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                  <WifiOff className="w-3.5 h-3.5" /> 로컬 모드 (단독 패드)
                </span>
              )}
              {syncError && (
                <span className="text-xs text-rose-600 font-medium">{syncError}</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              개인정보(연락처·주소) 없이 <strong className="text-slate-700">고유번호 + 표시이름 + 구분태그</strong>만 저장합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSoundEnabled((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 transition"
              title="종료 알림음 켜기/끄기"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-indigo-600" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
              알림음
            </button>
            <button
              onClick={() => setShowCsvModal(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 transition"
            >
              <Upload className="w-4 h-4" /> 일괄 등록
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
            >
              <Plus className="w-4 h-4" /> 학생 등록
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem('leaders_art_unlocked');
                setUnlocked(false);
              }}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
            >
              <Lock className="w-4 h-4" /> 잠금
            </button>
          </div>
        </header>

        {/* Summary Cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">현재 수업 중</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{enrichedTimers.length}명</div>
          </div>
          <div className="bg-white border border-amber-200 rounded-xl p-4">
            <div className="text-xs text-amber-700 font-medium">🟡 마무리 준비 (10분↓)</div>
            <div className="text-2xl font-bold mt-1 tabular-nums text-amber-600">{warningCount}명</div>
          </div>
          <div className="bg-white border border-rose-200 rounded-xl p-4">
            <div className="text-xs text-rose-700 font-medium">🔴 하원 시간 (종료)</div>
            <div className="text-2xl font-bold mt-1 tabular-nums text-rose-600">{doneCount}명</div>
          </div>
          <div className="bg-white border border-emerald-200 rounded-xl p-4">
            <div className="text-xs text-emerald-700 font-medium">오늘 하원 완료</div>
            <div className="text-2xl font-bold mt-1 tabular-nums text-emerald-600">
              {appState.history.length}명
            </div>
          </div>
        </section>

        {/* Main 2-Column Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Quick Check-in (200 Students) */}
          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                ⚡ 빠른 등원 체크 (전체 {appState.students.length}명)
              </h2>
              <span className="text-xs text-slate-500">터치 시 50분 시작</span>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름, 고유번호(S-001), 반 검색..."
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs">
              {['전체', ...GROUPS].map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupFilter(g)}
                  className={`px-3 py-1.5 rounded-full border transition ${
                    groupFilter === g
                      ? 'bg-indigo-600 text-white border-indigo-600 font-medium'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {filteredStudents.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-10">
                  검색 결과가 없습니다.
                </div>
              ) : (
                filteredStudents.slice(0, 80).map((s) => {
                  const isActive = activeIds.has(s.id);
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
                          {s.id}
                        </span>
                        <span className="text-sm font-semibold text-slate-800 truncate">
                          {s.name}
                        </span>
                        <span className="text-xs text-slate-500">{s.group}</span>
                      </div>
                      {isActive ? (
                        <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
                          수업 중
                        </span>
                      ) : (
                        <button
                          onClick={() => handleCheckIn(s)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:scale-95 transition"
                        >
                          등원 ({s.defaultMinutes || 50}분)
                        </button>
                      )}
                    </div>
                  );
                })
              )}
              {filteredStudents.length > 80 && (
                <div className="text-xs text-center text-slate-400 py-2">
                  검색어로 더 좁혀보세요 (총 {filteredStudents.length}명)
                </div>
              )}
            </div>
          </section>

          {/* Right: Active Timers / History / Students */}
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRightTab('active')}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                    rightTab === 'active'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" /> 수업 중 (남은 시간순)
                </button>
                <button
                  onClick={() => setRightTab('history')}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                    rightTab === 'history'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> 오늘 하원 기록
                </button>
                <button
                  onClick={() => setRightTab('students')}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                    rightTab === 'students'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> 학생 명단
                </button>
              </div>
              <span className="text-xs text-slate-500 font-mono">현재 {formatClock(now)}</span>
            </div>

            {/* Tab 1: Active Timers */}
            {rightTab === 'active' && (
              <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
                {enrichedTimers.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-16">
                    현재 수업 중인 학생이 없습니다. 왼쪽에서 학생을 등원 체크해 주세요.
                  </div>
                ) : (
                  enrichedTimers.map((item) => {
                    const isDone = item.remainingMs <= 0;
                    const isWarning = !isDone && item.remainingMs <= 10 * 60 * 1000;

                    const borderCls = isDone
                      ? 'border-rose-300 bg-rose-50/40'
                      : isWarning
                      ? 'border-amber-300 bg-amber-50/40'
                      : 'border-slate-200 bg-slate-50/60';

                    const barCls = isDone
                      ? 'bg-rose-500'
                      : isWarning
                      ? 'bg-amber-500'
                      : 'bg-indigo-600';

                    const timeCls = isDone
                      ? 'text-rose-600'
                      : isWarning
                      ? 'text-amber-600'
                      : 'text-slate-900';

                    const expectedEnd = formatClock(
                      item.startTime + (item.durationMin || 50) * 60 * 1000
                    );

                    return (
                      <div
                        key={item.studentId}
                        className={`p-4 rounded-xl border ${borderCls} space-y-2.5`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isDone ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-600 text-white font-semibold">
                                  🔴 하원 시간!
                                </span>
                              ) : isWarning ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 font-semibold">
                                  🟡 마무리 준비
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                                  🔵 수업 중
                                </span>
                              )}
                              <span className="text-base font-bold text-slate-900">
                                {item.student.name}
                              </span>
                              <span className="text-xs font-mono text-slate-500">
                                {item.student.id} · {item.student.group}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              등원 {formatClock(item.startTime)} → 종료 예정 {expectedEnd} (
                              {item.durationMin || 50}분)
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className={`text-2xl font-bold font-mono tabular-nums ${timeCls}`}>
                              {formatRemaining(item.remainingMs)}
                            </div>
                            <div className="text-xs text-slate-500">
                              {isDone ? '초과 시간' : '남은 시간'}
                            </div>
                          </div>
                        </div>

                        <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full ${barCls} transition-all duration-300`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleAdjustTime(item.studentId, -5)}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100"
                            >
                              -5분
                            </button>
                            <button
                              onClick={() => handleAdjustTime(item.studentId, 5)}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100"
                            >
                              +5분
                            </button>
                            <input
                              type="text"
                              value={item.note || ''}
                              onChange={(e) => handleUpdateNote(item.studentId, e.target.value)}
                              placeholder="메모 (예: 차량)"
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 w-28 md:w-36 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>

                          <button
                            onClick={() => handleCheckOut(item.studentId)}
                            className="text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 active:scale-95 transition"
                          >
                            ✓ 하원 완료
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab 2: Today's History */}
            {rightTab === 'history' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    총 {appState.history.length}건의 하원 기록
                  </span>
                  {appState.history.length > 0 && (
                    <button
                      onClick={handleExportHistoryCsv}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV 다운로드
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {appState.history.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-16">
                      오늘 하원 완료된 기록이 아직 없습니다.
                    </div>
                  ) : (
                    appState.history.map((h, idx) => (
                      <div
                        key={`${h.studentId}-${h.endTime}-${idx}`}
                        className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-500">{h.studentId}</span>
                          <span className="font-semibold text-sm text-slate-800">{h.name}</span>
                          <span className="text-slate-500">{h.group}</span>
                          {h.note && (
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                              {h.note}
                            </span>
                          )}
                        </div>
                        <div className="text-right text-slate-500">
                          {formatClock(h.startTime)} ~ {formatClock(h.endTime)}{' '}
                          <span className="font-semibold text-slate-800">({h.stayedMin}분)</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Minimal-Info Student Management */}
            {rightTab === 'students' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    등록된 학생 {appState.students.length}명 (고유번호·이름·반만 저장)
                  </span>
                  <button
                    onClick={handleResetSamples}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> 200명 예시 초기화
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
                  {appState.students.slice(0, 100).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-slate-500">{s.id}</span>
                        <span className="font-semibold text-sm text-slate-800">{s.name}</span>
                        <span className="text-slate-500">{s.group}</span>
                        <span className="text-slate-400">({s.defaultMinutes || 50}분)</span>
                      </div>
                      <button
                        onClick={() => handleDeleteStudent(s.id)}
                        className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleAddStudent}
            className="bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-lg"
          >
            <h3 className="text-base font-bold text-slate-900">최소 정보 학생 등록</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1">표시 이름 (또는 별명/이니셜)</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="예: 김민준 또는 민준(수채화)"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">구분 태그</label>
                <select
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                >
                  {GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-600 mb-1">기본 수업 시간 (분)</label>
                <input
                  type="number"
                  min={10}
                  max={180}
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-xs px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="submit"
                className="text-xs px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
              >
                등록하기
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CSV Bulk Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-md space-y-4 shadow-lg">
            <h3 className="text-base font-bold text-slate-900">학생 일괄 등록 (복사/붙여넣기)</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              엑셀에서 <code className="bg-slate-100 px-1 rounded">이름, 반, 수업시간(분)</code>{' '}
              형식으로 복사해서 붙여넣으세요. (전화번호 등 개인정보는 제외)
            </p>
            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'김서연, 초등저, 50\n박도윤, 유치부, 50\n이하준, 초등고, 60'}
              className="w-full p-3 text-xs font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="text-xs px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleBulkCsvImport}
                className="text-xs px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
              >
                일괄 추가하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
