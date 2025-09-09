import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

// === Вспомогательные функции дат ===
const startOfWeekMon = (d = new Date()) => {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Mon=0..Sun=6
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
};
const endOfWeekSun = (d = new Date()) => {
  const start = startOfWeekMon(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};
const startOfMonth = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const isWorkday = (d) => d.getDay() !== 0 && d.getDay() !== 6;
const countWorkdays = (from, to) => {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  let cnt = 0;
  for (let dt = new Date(a); dt <= b; dt.setDate(dt.getDate() + 1)) {
    if (isWorkday(dt)) cnt++;
  }
  return Math.max(0, cnt);
};

// === Хранилище (MVP — localStorage) ===
const LS_KEY_LOGS = "salesLogsV1";
const LS_KEY_TARGETS = "salesTargetsV1";
const LS_KEY_ROSTER = "salesRosterV1";

const defaultRoster = ["Иван Иванов", "Пётр Петров", "Анна Смирнова"];
const defaultTargets = {
  daily_presentations_target: 2,
  daily_dials_target: 30,
  daily_activity_minutes_target: 120,
  monthly_invoices_target: 30,
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// === Немного звука для фанфар ===
function playFanfare() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  const notes = [261.63, 329.63, 392.0, 523.25]; // C E G C
  notes.forEach((freq, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    const t0 = now + i * 0.12;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.15, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    o.start(t0);
    o.stop(t0 + 0.28);
  });
}

// === Цвет для бейджей run-rate ===
const rrColor = (v) =>
  v >= 1
    ? "bg-green-100 text-green-900"
    : v >= 0.8
    ? "bg-amber-100 text-amber-900"
    : "bg-red-100 text-red-900";

// Специальное значение для агрегации по всей команде
const ALL_VALUE = "__ALL__";
const labelOf = (v) => (v === ALL_VALUE ? "Команда (все)" : v);

export default function App() {
  // Состояния
  const [roster, setRoster] = useState(() => loadJSON(LS_KEY_ROSTER, defaultRoster));
  const [manager, setManager] = useState(
    () => loadJSON(LS_KEY_ROSTER, defaultRoster)[0] || "Иван Иванов"
  );
  const [targets, setTargets] = useState(() => loadJSON(LS_KEY_TARGETS, defaultTargets));
  const [logs, setLogs] = useState(() => loadJSON(LS_KEY_LOGS, []));

  const [plan, setPlan] = useState({ a: 0, c: 0, p: 0 });
  const [fact, setFact] = useState({
    a: 0,
    c: 0,
    done: 0,
    inv: 0,
    pay: 0,
    mc: 0,
    mp: 0,
    dials: 0,
  });

  const [showGuitar, setShowGuitar] = useState(false);
  const [showApplause, setShowApplause] = useState(false);
  const [activityTab, setActivityTab] = useState("week"); // 'week' | 'month'

  // Синхронизация в localStorage
  useEffect(() => saveJSON(LS_KEY_ROSTER, roster), [roster]);
  useEffect(() => saveJSON(LS_KEY_TARGETS, targets), [targets]);
  useEffect(() => saveJSON(LS_KEY_LOGS, logs), [logs]);

  // Демо-данные для пары коллег — чтобы графики были не пустыми
  useEffect(() => {
    if (logs.length === 0) {
      const today = new Date();
      const monday = startOfWeekMon(today);
      const fmt = (d) => d.toISOString().slice(0, 10);
      const seed = [];
      const teammates = ["Пётр Петров", "Анна Смирнова"];
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        if (!isWorkday(d)) continue;
        teammates.forEach((m, idx) => {
          seed.push({
            date: fmt(d),
            manager: m,
            plan_pres_assigned: 4 + idx,
            plan_pres_confirmed: 3 + idx,
            plan_payments_planned: 1,
            fact_pres_assigned: 4 + idx,
            fact_pres_confirmed: 3 + idx,
            fact_pres_conducted: 2 + (idx % 2),
            invoices_issued: 1 + (i % 2),
            payments_received: i % 3 === 0 ? 1 : 0,
            minutes_calls: 60 + 5 * i,
            minutes_presentations: 60 + 10 * i,
            dials: 30 + 2 * i,
          });
        });
      }
      setLogs(seed);
    }
  }, []);

  // Периоды
  const today = new Date();
  const weekStart = startOfWeekMon(today),
    weekEnd = endOfWeekSun(today);
  const monthStart = startOfMonth(today),
    monthEnd = endOfMonth(today);

  // Рабочие дни
  const WTD = countWorkdays(weekStart, today);
  const WTR = countWorkdays(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
    weekEnd
  );
  const MTD = countWorkdays(monthStart, today);
  const MTotal = countWorkdays(monthStart, monthEnd);

  // Полный список менеджеров, замеченных в системе
  const managersAll = useMemo(
    () => Array.from(new Set([...(roster || []), ...logs.map((l) => l.manager)])),
    [roster, logs]
  );

  // Фильтр по выбранному менеджеру (или все)
  const filterBySelection = (rows) => {
    if (manager === ALL_VALUE) return rows;
    return rows.filter((r) => r.manager === manager);
    };

  // Ряды за неделю/месяц с фильтром
  const rowsWeek = useMemo(
    () =>
      filterBySelection(
        logs.filter(
          (r) => new Date(r.date) >= weekStart && new Date(r.date) <= weekEnd
        )
      ),
    [logs, manager, weekStart, weekEnd]
  );
  const rowsMonth = useMemo(
    () =>
      filterBySelection(
        logs.filter(
          (r) => new Date(r.date) >= monthStart && new Date(r.date) <= monthEnd
        )
      ),
    [logs, manager, monthStart, monthEnd]
  );

  // Суммы
  const sum = (arr, key) => arr.reduce((a, r) => a + (r[key] || 0), 0);
  const presDoneW = sum(rowsWeek, "fact_pres_conducted");
  const dialsW = sum(rowsWeek, "dials");
  const minsW = sum(rowsWeek, "minutes_calls") + sum(rowsWeek, "minutes_presentations");
  const invoicesMTD = sum(rowsMonth, "invoices_issued");
  const paymentsMTD = sum(rowsMonth, "payments_received");
  const pushlist = Math.max(0, invoicesMTD - paymentsMTD);

  // Размер команды (для агрегированного run-rate)
  const teamSize = manager === ALL_VALUE ? managersAll.length : 1;

  // Целевые значения к дате
  const tPresWTD =
    (targets.daily_presentations_target || 2) * Math.max(1, WTD) * teamSize;
  const tDialsWTD =
    (targets.daily_dials_target || 30) * Math.max(1, WTD) * teamSize;
  const tMinsWTD =
    (targets.daily_activity_minutes_target || 120) * Math.max(1, WTD) * teamSize;
  const tInvMTD = Math.ceil(
    (targets.monthly_invoices_target || 30) *
      (MTotal ? MTD / MTotal : 0) *
      teamSize
  );

  // Run-rate
  const rrPres = tPresWTD ? presDoneW / tPresWTD : 0;
  const rrDials = tDialsWTD ? dialsW / tDialsWTD : 0;
  const rrMins = tMinsWTD ? minsW / tMinsWTD : 0;
  const rrInv = tInvMTD ? invoicesMTD / tInvMTD : 0;

  // Дефициты и сколько нужно/день до конца недели
  const defPres = Math.max(0, tPresWTD - presDoneW);
  const defDials = Math.max(0, tDialsWTD - dialsW);
  const defMins = Math.max(0, tMinsWTD - minsW);
  const needPresPerDay = WTR ? Math.ceil(defPres / WTR) : 0;
  const needDialsPerDay = WTR ? Math.ceil(defDials / WTR) : 0;
  const needMinsPerDay = WTR ? Math.ceil(defMins / WTR) : 0;

  // Лидерборд по неделе (всегда по индивидуальным менеджерам)
  const leaderboard = managersAll
    .map((m) => {
      const rowsW = logs.filter(
        (r) => r.manager === m && new Date(r.date) >= weekStart && new Date(r.date) <= weekEnd
      );
      const rowsM = logs.filter(
        (r) => r.manager === m && new Date(r.date) >= monthStart && new Date(r.date) <= monthEnd
      );
      const sumW = (k) => rowsW.reduce((a, r) => a + (r[k] || 0), 0);
      const sumM = (k) => rowsM.reduce((a, r) => a + (r[k] || 0), 0);
      return {
        manager: m,
        pres: sumW("fact_pres_conducted"),
        dials: sumW("dials"),
        mins: sumW("minutes_calls") + sumW("minutes_presentations"),
        pays: sumM("payments_received"),
      };
    })
    .sort((a, b) => b.pres - a.pres || b.pays - a.pays || b.dials - a.dials);

  // Данные для недельного графика
  const chartDataWeek = useMemo(() => {
    const data = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const dayRows = logs.filter((r) => r.date === key);
      const filtered = manager === ALL_VALUE ? dayRows : dayRows.filter((r) => r.manager === manager);
      const total = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
      data.push({
        day: d.toLocaleDateString("ru-RU", { weekday: "short" }),
        "Презы": total(filtered, "fact_pres_conducted"),
        "Наборы": total(filtered, "dials"),
        "Минуты": total(filtered, "minutes_calls") + total(filtered, "minutes_presentations"),
      });
    }
    return data;
  }, [logs, manager, weekStart]);

  // Данные для месячного графика
  const chartDataMonth = useMemo(() => {
    const daysInMonth = endOfMonth(today).getDate();
    const series = [];
    for (let dDay = 1; dDay <= daysInMonth; dDay++) {
      const d = new Date(today.getFullYear(), today.getMonth(), dDay);
      const key = d.toISOString().slice(0, 10);
      const dayRows = logs.filter((r) => r.date === key);
      const filtered = manager === ALL_VALUE ? dayRows : dayRows.filter((r) => r.manager === manager);
      const total = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
      series.push({
        day: dDay.toString().padStart(2, "0"),
        "Презы": total(filtered, "fact_pres_conducted"),
        "Наборы": total(filtered, "dials"),
        "Минуты": total(filtered, "minutes_calls") + total(filtered, "minutes_presentations"),
      });
    }
    return series;
  }, [logs, manager, today]);

  // Апдейт строки за сегодня (план/факт)
  const todayKey = new Date().toISOString().slice(0, 10);
  const upsertRow = (patch) => {
    const idx = logs.findIndex((r) => r.manager === manager && r.date === todayKey);
    if (idx >= 0) {
      const next = [...logs];
      next[idx] = { ...next[idx], ...patch };
      setLogs(next);
    } else {
      setLogs([
        ...logs,
        {
          date: todayKey,
          manager,
          plan_pres_assigned: 0,
          plan_pres_confirmed: 0,
          plan_payments_planned: 0,
          fact_pres_assigned: 0,
          fact_pres_confirmed: 0,
          fact_pres_conducted: 0,
          invoices_issued: 0,
          payments_received: 0,
          minutes_calls: 0,
          minutes_presentations: 0,
          dials: 0,
          ...patch,
        },
      ]);
    }
  };

  // Обработчики сохранения
  const onSubmitPlan = () => {
    upsertRow({
      plan_pres_assigned: plan.a | 0,
      plan_pres_confirmed: plan.c | 0,
      plan_payments_planned: plan.p | 0,
    });
    setShowGuitar(true);
    playFanfare();
    setTimeout(() => setShowGuitar(false), 2400);
  };
  const onSubmitFact = () => {
    upsertRow({
      fact_pres_assigned: fact.a | 0,
      fact_pres_confirmed: fact.c | 0,
      fact_pres_conducted: fact.done | 0,
      invoices_issued: fact.inv | 0,
      payments_received: fact.pay | 0,
      minutes_calls: fact.mc | 0,
      minutes_presentations: fact.mp | 0,
      dials: fact.dials | 0,
    });
    const nowInv = invoicesMTD + (fact.inv | 0);
    if (nowInv >= tInvMTD && tInvMTD > 0) {
      setShowApplause(true);
      confetti({ particleCount: 160, spread: 70, origin: { y: 0.3 } });
      setTimeout(() => setShowApplause(false), 2500);
    }
  };

  // Маленький виджет-метрика
  const Stat = ({ label, value, sub, tone = "" }) => (
    <div className={`p-4 rounded-2xl border bg-white shadow-sm ${tone}`}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <header className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Контроль метрик — одностраничник</h1>
          <p className="text-sm text-slate-600">
            План/Факт, run-rate, подсветка просадок, лидерборд. С анимациями 🤘
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="px-3 py-2 rounded-xl border bg-white"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
          >
            <option value={ALL_VALUE}>Команда (все)</option>
            {managersAll.map((m) => (
              <option key={m} value={m}>
                {labelOf(m)}
              </option>
            ))}
          </select>
          <button
            className="px-3 py-2 rounded-xl border bg-white hover:bg-slate-50"
            onClick={() => {
              const name = prompt("Имя нового менеджера");
              if (name && !(roster || []).includes(name)) setRoster([...(roster || []), name]);
            }}
          >
            + менеджер
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-6 pb-24">
        {/* ===== Левая колонка: цели + формы (только для конкретного менеджера) ===== */}
        <section className="lg:col-span-1 space-y-6">
          <div className="p-5 rounded-2xl bg-white border shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Цели (по умолчанию)</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                През/день
                <input
                  type="number"
                  className="w-24 px-2 py-1 rounded border"
                  value={targets.daily_presentations_target}
                  onChange={(e) =>
                    setTargets({ ...targets, daily_presentations_target: +e.target.value })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                Наборы/день
                <input
                  type="number"
                  className="w-24 px-2 py-1 rounded border"
                  value={targets.daily_dials_target}
                  onChange={(e) => setTargets({ ...targets, daily_dials_target: +e.target.value })}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                Минуты/день
                <input
                  type="number"
                  className="w-24 px-2 py-1 rounded border"
                  value={targets.daily_activity_minutes_target}
                  onChange={(e) =>
                    setTargets({ ...targets, daily_activity_minutes_target: +e.target.value })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                Счета/мес
                <input
                  type="number"
                  className="w-24 px-2 py-1 rounded border"
                  value={targets.monthly_invoices_target}
                  onChange={(e) =>
                    setTargets({ ...targets, monthly_invoices_target: +e.target.value })
                  }
                />
              </label>
            </div>
          </div>

          {manager !== ALL_VALUE && (
            <>
              <div className="p-5 rounded-2xl bg-white border shadow-sm relative overflow-hidden">
                <h2 className="text-lg font-semibold mb-3">Утренний план (сегодня) — {labelOf(manager)}</h2>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <label className="flex flex-col">
                    Назначено КЦ
                    <input
                      type="number"
                      className="px-2 py-1 rounded border"
                      value={plan.a}
                      onChange={(e) => setPlan((p) => ({ ...p, a: +e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col">
                    Подтвердить
                    <input
                      type="number"
                      className="px-2 py-1 rounded border"
                      value={plan.c}
                      onChange={(e) => setPlan((p) => ({ ...p, c: +e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col">
                    Ожид. оплат
                    <input
                      type="number"
                      className="px-2 py-1 rounded border"
                      value={plan.p}
                      onChange={(e) => setPlan((p) => ({ ...p, p: +e.target.value }))}
                    />
                  </label>
                </div>
                <button
                  onClick={onSubmitPlan}
                  className="mt-3 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                >
                  Сохранить план
                </button>

                <AnimatePresence>
                  {showGuitar && (
                    <motion.div
                      initial={{ scale: 0.2, rotate: -30, opacity: 0 }}
                      animate={{
                        scale: [0.2, 1.1, 1],
                        rotate: [-30, 0, 10, -10, 0],
                        opacity: 1,
                      }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 1.8 }}
                      className="absolute -right-6 -bottom-6 text-8xl select-none"
                    >
                      <span role="img" aria-label="guitar">
                        🎸
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="p-5 rounded-2xl bg-white border shadow-sm">
                <h2 className="text-lg font-semibold mb-3">Вечерний факт (сегодня) — {labelOf(manager)}</h2>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <label className="flex flex-col">
                    Назначено
                    <input
                      type="number"
                      className="px-2 py-1 rounded border"
                      value={fact.a}
                      onChange={(e) => setFact((f) => ({ ...f, a: +e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col">
                    Подтверждено
                    <input
                      type="number"
                      className="px-2 py-1 rounded border"
                      value={fact.c}
                      onChange={(e) => setFact((f) => ({ ...f, c: +e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col">
                    Проведено
                    <input
                      type="number"
                      className="px-2 py-1 rounded border"
                      value={fact.done}
                      onChange={(e) => setFact((f) => ({ ...f, done: +e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col">
                    Счета
                    <input
                      type="number"
                      className="px-2 py-1 rounded border"
                      value={fact.inv}
                      onChange={(e) => setFact((f) => ({ ...f, inv: +e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col">
                    Оплаты
                    <input
                      type="number"
                      className="px-2 py-1 rounded border"
                      value={fact.pay}
                      onChange={(e) => setFact((f) => ({ ...f, pay: +e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col">
                    Звонки, мин
                    <input
                      type="number"
                      className="px-2 py-1 rounded border"
                      value={fact.mc}
                      onChange={(e) => setFact((f) => ({ ...f, mc: +e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col">
                    Презы, мин
                    <input
                      type="number"
                      className="px-2 py-1 rounded border"
                      value={fact.mp}
                      onChange={(e) => setFact((f) => ({ ...f, mp: +e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col">
                    Наборы
                    <input
                      type="number"
                      className="px-2 py-1 rounded border"
                      value={fact.dials}
                      onChange={(e) => setFact((f) => ({ ...f, dials: +e.target.value }))}
                    />
                  </label>
                </div>
                <button
                  onClick={onSubmitFact}
                  className="mt-3 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                >
                  Сохранить факт
                </button>

                <AnimatePresence>
                  {showApplause && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
                    >
                      <motion.div
                        initial={{ scale: 0.7 }}
                        animate={{ scale: [0.7, 1.05, 1] }}
                        transition={{ duration: 0.5 }}
                        className="bg-white/90 rounded-3xl p-8 shadow-2xl border text-center"
                      >
                        <div className="text-6xl">👏👏👏</div>
                        <div className="mt-2 text-xl font-semibold">
                          Аплодисменты! План месяца по счетам — на уровне к дате 🎯
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </section>

        {/* ===== Средняя колонка: недельные KPI и месяц ===== */}
        <section className="lg:col-span-1 space-y-6">
          <div className="p-5 rounded-2xl bg-white border shadow-sm">
            <h2 className="text-lg font-semibold mb-3">
              {manager === ALL_VALUE ? "Неделя — команда" : "Неделя — " + labelOf(manager)}: Run-rate и дефициты
            </h2>
            <div className="grid grid-cols-1 gap-3">
              <div className="p-4 rounded-2xl border bg-white flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Проведённые презентации</div>
                  <div className="text-2xl font-semibold">
                    {presDoneW} / {tPresWTD}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Нужно/день до конца недели: <b>{needPresPerDay}</b>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${rrColor(rrPres)}`}>
                  run-rate {(rrPres || 0).toFixed(2)}
                </span>
              </div>

              <div className="p-4 rounded-2xl border bg-white flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Наборы (звонки)</div>
                  <div className="text-2xl font-semibold">
                    {dialsW} / {tDialsWTD}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Нужно/день до конца недели: <b>{needDialsPerDay}</b>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${rrColor(rrDials)}`}>
                  run-rate {(rrDials || 0).toFixed(2)}
                </span>
              </div>

              <div className="p-4 rounded-2xl border bg-white flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Активность (минуты: звонки+презы)</div>
                  <div className="text-2xl font-semibold">
                    {minsW} / {tMinsWTD}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Нужно/день до конца недели: <b>{needMinsPerDay}</b>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${rrColor(rrMins)}`}>
                  run-rate {(rrMins || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border shadow-sm">
            <h2 className="text-lg font-semibold mb-3">
              {manager === ALL_VALUE ? "Месяц — команда" : "Месяц — " + labelOf(manager)}: счета и дожим
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <Stat
                label="Счета (MTD)"
                value={`${invoicesMTD}`}
                sub={`Цель к дате: ${tInvMTD}`}
                tone={rrColor(rrInv)}
              />
              <Stat label="Оплаты (MTD)" value={`${paymentsMTD}`} />
              <Stat label="Дожим (счета−оплаты)" value={`${pushlist}`} />
            </div>
          </div>
        </section>

        {/* ===== Правая колонка: активность по дням + лидерборд ===== */}
        <section className="lg:col-span-1 space-y-6">
          <div className="p-5 rounded-2xl bg-white border shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">
                {activityTab === "week" ? "Неделя — активность по дням" : "Месяц — активность по дням"}
              </h2>
              <div className="flex gap-2">
                <button
                  className={`px-3 py-1 rounded-xl border ${
                    activityTab === "week" ? "bg-slate-900 text-white" : "bg-white"
                  }`}
                  onClick={() => setActivityTab("week")}
                >
                  Неделя
                </button>
                <button
                  className={`px-3 py-1 rounded-xl border ${
                    activityTab === "month" ? "bg-slate-900 text-white" : "bg-white"
                  }`}
                  onClick={() => setActivityTab("month")}
                >
                  Месяц
                </button>
              </div>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityTab === "week" ? chartDataWeek : chartDataMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {/* Цвета укажет Recharts по умолчанию; можно кастомизировать позже */}
                  <Bar dataKey="Презы" />
                  <Bar dataKey="Наборы" />
                  <Bar dataKey="Минуты" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Лидерборд (неделя)</h2>
            <div className="space-y-2">
              {leaderboard.map((row, idx) => (
                <div
                  key={row.manager}
                  className="grid grid-cols-5 items-center gap-2 text-sm p-2 rounded-xl border"
                >
                  <div className="font-medium truncate">
                    {idx + 1}. {row.manager}
                  </div>
                  <div className="text-center">
                    <span className="text-xs text-gray-500">през</span> <b>{row.pres}</b>
                  </div>
                  <div className="text-center">
                    <span className="text-xs text-gray-500">наборы</span> <b>{row.dials}</b>
                  </div>
                  <div className="text-center">
                    <span className="text-xs text-gray-500">мин</span> <b>{row.mins}</b>
                  </div>
                  <div className="text-center">
                    <span className="text-xs text-gray-500">оплаты</span> <b>{row.pays}</b>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="text-center text-xs text-slate-500 pb-6">
        MVP локально. Для общего хранилища команды: Supabase / Google Sheets + auth.
      </footer>
    </div>
  );
}
