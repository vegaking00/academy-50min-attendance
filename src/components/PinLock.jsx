import React, { useState } from 'react';
import { Lock, Delete } from 'lucide-react';

const EXPECTED_PIN = import.meta.env.VITE_ACADEMY_PIN || '1234';

export default function PinLock({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleDigit = (digit) => {
    if (pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    setError(false);

    if (next.length === EXPECTED_PIN.length) {
      if (next === EXPECTED_PIN) {
        sessionStorage.setItem('leaders_art_unlocked', '1');
        onUnlock();
      } else {
        setError(true);
        setTimeout(() => setPin(''), 400);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xs bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">리더스아트 출석부</h1>
          <p className="text-xs text-slate-500">
            선생님 전용 PIN 번호를 입력하세요 (초기: 1234)
          </p>
        </div>

        <div className="flex justify-center gap-3 py-1">
          {Array.from({ length: EXPECTED_PIN.length }).map((_, idx) => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full transition-all ${
                error
                  ? 'bg-rose-500 scale-110'
                  : idx < pin.length
                  ? 'bg-indigo-600 scale-110'
                  : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-center text-rose-600 font-medium">
            PIN 번호가 일치하지 않습니다.
          </p>
        )}

        <div className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              className="h-14 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-indigo-50 text-lg font-semibold text-slate-800 border border-slate-200 transition"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            onClick={() => handleDigit('0')}
            className="h-14 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-indigo-50 text-lg font-semibold text-slate-800 border border-slate-200 transition"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="h-14 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center transition"
            aria-label="지우기"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
