import React, { useState, useEffect, useRef } from 'react';
import { Plus, Check, Flame, Trash2, X, Calendar as CalendarIcon, ListChecks, Home as HomeIcon, Award, Lock, ChevronLeft, ChevronRight, Pencil, Settings, Sun, Moon, Smartphone, Download, Upload, Bell, Cloud, FileText, Shield, Mail, Info, AlertCircle, NotebookPen } from 'lucide-react';

// ---- Palettes ----
const PALETTE_DARK = {
  bg: '#000000',
  surface: '#1C1C1E',
  surfaceAlt: '#2C2C2E',
  surfaceHi: '#3A3A3C',
  ink: '#F2F2F7',
  inkSoft: '#AEAEB2',
  inkMuted: '#8E8E93',
  border: '#38383A',
  borderSoft: '#2C2C2E',
  sage: '#30D158',
  sageDeep: '#5EE07F',
  sageLight: '#1F4F2F',
  sageBg: '#0E2818',
  flame: '#FF9F0A',
  red: '#FF453A',
};

const PALETTE_LIGHT = {
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceAlt: '#E5E5EA',
  surfaceHi: '#D1D1D6',
  ink: '#1C1C1E',
  inkSoft: '#3C3C43',
  inkMuted: '#8E8E93',
  border: '#D1D1D6',
  borderSoft: '#E5E5EA',
  sage: '#34C759',
  sageDeep: '#28A745',
  sageLight: '#B8E5C2',
  sageBg: '#E8F5EC',
  flame: '#FF9500',
  red: '#FF3B30',
};

// `C` is now the default (dark) palette, kept as a fallback for any legacy reference.
// All views read from the React context via `useTheme()` instead.
const C = PALETTE_DARK;

const ThemeContext = React.createContext({ palette: PALETTE_DARK, mode: 'dark' });
const useTheme = () => React.useContext(ThemeContext);

// ---- Design tokens (Apple-inspired) ----
const R = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 28,
  full: 9999,
};
const S = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};
// Apple-style easing for animations
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

// ---- Date helpers ----
const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Robust unique-id helper (uses crypto.randomUUID when available, falls back otherwise)
const uid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return uid();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
};
const today = () => new Date();
const todayKey = () => dateKey(today());
const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const longDate = (d) =>
  d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = (d) => d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
const dayNum = (d) => d.getDate();

// ---- Schedule helpers ----
const DEFAULT_SCHEDULE = { type: 'daily' };

// Returns the schedule for an habit, with backward compat (no schedule = daily)
function getSchedule(habit) {
  return habit.schedule || DEFAULT_SCHEDULE;
}

// Is the habit due (expected to be done) on a given date?
function isHabitDueOn(habit, date) {
  const s = getSchedule(habit);
  if (s.type === 'daily') return true;
  if (s.type === 'weekdays') {
    const dow = date.getDay(); // 0=sunday, 1=monday, ..., 6=saturday
    return (s.days || []).includes(dow);
  }
  if (s.type === 'weekly') return true; // always shown, target is X per week
  return true;
}

// Human-readable label
const DOW_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const DOW_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function scheduleLabel(habit) {
  const s = getSchedule(habit);
  if (s.type === 'daily') return 'Tous les jours';
  if (s.type === 'weekdays') {
    const days = (s.days || []).slice().sort();
    if (days.length === 7) return 'Tous les jours';
    if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return 'En semaine';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Le week-end';
    return days.map((d) => DOW_SHORT[d]).join(' · ');
  }
  if (s.type === 'weekly') return `${s.count}x par semaine`;
  return '';
}

// Get the Monday of the week containing the given date
function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const offset = (dow + 6) % 7; // monday = 0
  d.setDate(d.getDate() - offset);
  return d;
}

// How many times an habit was completed in the week containing `date`
function weeklyCompletionCount(habit, completions, date) {
  const start = startOfWeek(date);
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (completions[dateKey(d)]?.[habit.id]) count++;
  }
  return count;
}

// ---- Streak: consecutive DUE days completed ending today (or yesterday if today not done) ----
// Skips days when the habit was not due. For "weekly" habits, uses week-by-week logic.
function computeStreak(habit, completions) {
  const habitId = habit.id;
  const s = getSchedule(habit);

  if (s.type === 'weekly') {
    // Weekly streak: consecutive weeks where the count target was met
    const target = s.count || 1;
    let streak = 0;
    let weekStart = startOfWeek(today());
    // If this week is not yet completed, check from last week
    const thisWeekDone = weeklyCompletionCount(habit, completions, today()) >= target;
    if (!thisWeekDone) weekStart = addDays(weekStart, -7);
    while (weeklyCompletionCount(habit, completions, weekStart) >= target) {
      streak++;
      weekStart = addDays(weekStart, -7);
    }
    return streak;
  }

  // daily / weekdays: walk back day by day, only counting due days
  let streak = 0;
  let d = today();
  // If today is due but not done, start from yesterday
  if (isHabitDueOn(habit, d) && !completions[dateKey(d)]?.[habitId]) {
    d = addDays(d, -1);
  }
  while (true) {
    if (isHabitDueOn(habit, d)) {
      if (completions[dateKey(d)]?.[habitId]) {
        streak++;
      } else {
        break; // missed a due day
      }
    }
    // Skip days where habit is not due (just go back one more)
    d = addDays(d, -1);
    // Safety: stop after 5 years
    if (streak > 1825) break;
  }
  return streak;
}

// Best streak ever (longest run of consecutive DUE days completed)
function computeBestStreak(habit, completions) {
  const habitId = habit.id;
  const s = getSchedule(habit);

  if (s.type === 'weekly') {
    const target = s.count || 1;
    // Find earliest completion week
    const dates = Object.keys(completions)
      .filter((k) => completions[k]?.[habitId])
      .sort();
    if (dates.length === 0) return 0;
    const firstWeek = startOfWeek(new Date(dates[0]));
    const lastWeek = startOfWeek(today());
    let best = 0;
    let current = 0;
    let w = new Date(firstWeek);
    while (w <= lastWeek) {
      if (weeklyCompletionCount(habit, completions, w) >= target) {
        current++;
        if (current > best) best = current;
      } else {
        current = 0;
      }
      w = addDays(w, 7);
    }
    return best;
  }

  // daily / weekdays
  const dates = Object.keys(completions)
    .filter((k) => completions[k]?.[habitId])
    .sort();
  if (dates.length === 0) return 0;
  const firstDate = new Date(dates[0]);
  const lastDate = today();
  let best = 0;
  let current = 0;
  let d = new Date(firstDate);
  d.setHours(0, 0, 0, 0);
  while (d <= lastDate) {
    if (isHabitDueOn(habit, d)) {
      if (completions[dateKey(d)]?.[habitId]) {
        current++;
        if (current > best) best = current;
      } else {
        current = 0;
      }
    }
    d = addDays(d, 1);
  }
  return best;
}

// ---- Compute total context for badge checks ----
function computeContext(habits, completions) {
  const totalCompletions = Object.values(completions).reduce(
    (sum, day) => sum + Object.keys(day || {}).length,
    0,
  );

  const habitCount = habits.length;

  const maxStreak = habits.reduce(
    (m, h) => Math.max(m, computeBestStreak(h, completions)),
    0,
  );

  // perfect day = ALL habits DUE on that day were completed (and at least one was due)
  const allDays = Object.keys(completions).sort();
  const perfectDays = new Set();
  if (habits.length > 0) {
    for (const k of allDays) {
      const d = new Date(k);
      const dueHabits = habits.filter((h) => isHabitDueOn(h, d));
      if (dueHabits.length === 0) continue;
      if (dueHabits.every((h) => completions[k]?.[h.id])) perfectDays.add(k);
    }
  }
  const hasPerfectDay = perfectDays.size > 0;

  // Longest run of consecutive perfect days
  let perfectDayStreak = 0;
  if (perfectDays.size > 0) {
    const sorted = [...perfectDays].sort();
    let best = 1;
    let cur = 1;
    for (let i = 1; i < sorted.length; i++) {
      const diff = Math.round((new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000);
      if (diff === 1) {
        cur++;
        if (cur > best) best = cur;
      } else cur = 1;
    }
    perfectDayStreak = best;
  }

  // App usage days = number of distinct days the user has cocheé something
  // Approximation: if no completions yet, treat earliest habit createdAt as start.
  let firstActivityMs = null;
  if (allDays.length > 0) {
    firstActivityMs = new Date(allDays[0]).getTime();
  } else if (habits.length > 0) {
    firstActivityMs = Math.min(...habits.map((h) => h.createdAt || Date.now()));
  }
  const todayMs = today().getTime();
  const appDays =
    firstActivityMs !== null
      ? Math.max(1, Math.floor((todayMs - firstActivityMs) / 86400000) + 1)
      : 0;

  // Habits with at least one completion in the last 7 days
  const recentCutoff = todayMs - 7 * 86400000;
  const activeHabitsCount = habits.filter((h) => {
    return Object.entries(completions).some(([k, v]) => {
      if (!v?.[h.id]) return false;
      return new Date(k).getTime() >= recentCutoff;
    });
  }).length;

  // Comeback : has there been a gap of 7+ days followed by activity?
  let hasComebackAfterBreak = false;
  if (allDays.length >= 2) {
    for (let i = 1; i < allDays.length; i++) {
      const gap = (new Date(allDays[i]) - new Date(allDays[i - 1])) / 86400000;
      if (gap >= 8) {
        hasComebackAfterBreak = true;
        break;
      }
    }
  }

  // Big comeback : did any habit have a streak >=7, then break, then build another streak >=7?
  let hadBrokenLongStreakAndRebuilt = false;
  for (const h of habits) {
    const dates = Object.keys(completions)
      .filter((k) => completions[k]?.[h.id])
      .sort();
    if (dates.length === 0) continue;
    let foundFirstLongStreak = false;
    let brokeAfter = false;
    let cur = 1;
    let prev = new Date(dates[0]);
    if (cur >= 7) foundFirstLongStreak = true; // safety
    for (let i = 1; i < dates.length; i++) {
      const curDate = new Date(dates[i]);
      const gap = Math.round((curDate - prev) / 86400000);
      if (gap === 1) {
        cur++;
      } else {
        if (cur >= 7) foundFirstLongStreak = true;
        if (foundFirstLongStreak && gap > 1) brokeAfter = true;
        cur = 1;
      }
      if (foundFirstLongStreak && brokeAfter && cur >= 7) {
        hadBrokenLongStreakAndRebuilt = true;
        break;
      }
      prev = curDate;
    }
    if (hadBrokenLongStreakAndRebuilt) break;
  }

  return {
    totalCompletions,
    habitCount,
    maxStreak,
    hasPerfectDay,
    perfectDayStreak,
    appDays,
    activeHabitsCount,
    hasComebackAfterBreak,
    hadBrokenLongStreakAndRebuilt,
  };
}

// ---- Global stats for the dashboard ----
function computeGlobalStats(habits, completions) {
  const todayDate = today();
  const todayMs = todayDate.getTime();

  // Total completions
  const totalCompletions = Object.values(completions).reduce(
    (sum, day) => sum + Object.keys(day || {}).length,
    0,
  );

  // App days = inclusive day count from first activity to today
  const allDays = Object.keys(completions).sort();
  let firstActivityMs = null;
  if (allDays.length > 0) {
    firstActivityMs = new Date(allDays[0]).getTime();
  } else if (habits.length > 0) {
    firstActivityMs = Math.min(...habits.map((h) => h.createdAt || Date.now()));
  }
  const appDays =
    firstActivityMs !== null
      ? Math.max(1, Math.floor((todayMs - firstActivityMs) / 86400000) + 1)
      : 0;

  // Global streak: consecutive days (counting back from today, or yesterday if today empty)
  // where AT LEAST ONE habit due that day was completed.
  let globalStreak = 0;
  let cursor = new Date(todayDate);
  cursor.setHours(0, 0, 0, 0);
  // If nothing done today and today has dues, start from yesterday
  const dueTodayList = habits.filter((h) => isHabitDueOn(h, cursor));
  const anyDoneToday = dueTodayList.some((h) => completions[dateKey(cursor)]?.[h.id]);
  if (!anyDoneToday && dueTodayList.length > 0) {
    cursor = addDays(cursor, -1);
  }
  // Walk back
  for (let i = 0; i < 5000; i++) {
    const k = dateKey(cursor);
    const dueOnDay = habits.filter((h) => isHabitDueOn(h, cursor));
    if (dueOnDay.length === 0) {
      // skip rest days (no streak break)
      cursor = addDays(cursor, -1);
      continue;
    }
    const anyDone = dueOnDay.some((h) => completions[k]?.[h.id]);
    if (anyDone) {
      globalStreak++;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }

  // 30-day average rate
  let sumRates = 0;
  let countedDays = 0;
  for (let i = 0; i < 30; i++) {
    const d = addDays(todayDate, -i);
    const dueOnDay = habits.filter((h) => isHabitDueOn(h, d));
    if (dueOnDay.length === 0) continue;
    const k = dateKey(d);
    const doneOnDay = dueOnDay.filter((h) => completions[k]?.[h.id]).length;
    sumRates += doneOnDay / dueOnDay.length;
    countedDays++;
  }
  const avg30 = countedDays > 0 ? sumRates / countedDays : 0;

  // Best & worst habits by 30-day completion rate (with at least 3 due days)
  const habitRates = habits
    .map((h) => {
      let due = 0;
      let done = 0;
      for (let i = 0; i < 30; i++) {
        const d = addDays(todayDate, -i);
        if (!isHabitDueOn(h, d)) continue;
        due++;
        if (completions[dateKey(d)]?.[h.id]) done++;
      }
      return { habit: h, rate: due > 0 ? done / due : 0, due };
    })
    .filter((r) => r.due >= 3);

  let bestHabit = null;
  let worstHabit = null;
  if (habitRates.length >= 2) {
    const sorted = [...habitRates].sort((a, b) => b.rate - a.rate);
    bestHabit = sorted[0];
    worstHabit = sorted[sorted.length - 1];
    // Don't show worst if it equals best (only 1 habit really tracked)
    if (worstHabit.habit.id === bestHabit.habit.id) worstHabit = null;
  } else if (habitRates.length === 1) {
    bestHabit = habitRates[0];
  }

  // 30-day daily activity for the mini chart
  const dailyActivity = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(todayDate, -i);
    const dueOnDay = habits.filter((h) => isHabitDueOn(h, d));
    const k = dateKey(d);
    const doneOnDay = dueOnDay.filter((h) => completions[k]?.[h.id]).length;
    dailyActivity.push({
      date: d,
      rate: dueOnDay.length > 0 ? doneOnDay / dueOnDay.length : null, // null = rest day
      done: doneOnDay,
      due: dueOnDay.length,
    });
  }

  return {
    totalCompletions,
    appDays,
    globalStreak,
    avg30,
    bestHabit,
    worstHabit,
    dailyActivity,
  };
}

// ---- Badge definitions ----
const BADGE_CATEGORIES = {
  start: { label: 'Démarrage', order: 1 },
  streak: { label: 'Régularité', order: 2 },
  volume: { label: 'Volume', order: 3 },
  diversity: { label: 'Diversité', order: 4 },
  comeback: { label: 'Résilience', order: 5 },
  special: { label: 'Spéciaux', order: 6 },
};

const BADGES = [
  // ---- Démarrage ----
  {
    id: 'first',
    category: 'start',
    name: 'Premier pas',
    emoji: '🌱',
    description: 'Coche ta première habitude',
    check: (ctx) => ctx.totalCompletions >= 1,
  },
  {
    id: 'three-habits',
    category: 'start',
    name: 'Bien équipé',
    emoji: '🧰',
    description: 'Crée 3 habitudes différentes',
    check: (ctx) => ctx.habitCount >= 3,
  },
  {
    id: 'first-week',
    category: 'start',
    name: 'Première semaine',
    emoji: '📅',
    description: '7 jours d’utilisation de l’app',
    check: (ctx) => ctx.appDays >= 7,
  },

  // ---- Régularité (streaks) ----
  {
    id: 'streak-3',
    category: 'streak',
    name: '3 jours d’affilée',
    emoji: '🔥',
    description: 'Une habitude maintenue 3 jours de suite',
    check: (ctx) => ctx.maxStreak >= 3,
  },
  {
    id: 'streak-7',
    category: 'streak',
    name: 'Une semaine',
    emoji: '⚡',
    description: 'Une habitude maintenue 7 jours de suite',
    check: (ctx) => ctx.maxStreak >= 7,
  },
  {
    id: 'streak-14',
    category: 'streak',
    name: 'Deux semaines',
    emoji: '🌊',
    description: '14 jours d’affilée',
    check: (ctx) => ctx.maxStreak >= 14,
  },
  {
    id: 'streak-21',
    category: 'streak',
    name: 'Trois semaines',
    emoji: '🌟',
    description: '21 jours d’affilée — l’habitude est ancrée',
    check: (ctx) => ctx.maxStreak >= 21,
  },
  {
    id: 'streak-30',
    category: 'streak',
    name: 'Un mois',
    emoji: '🏆',
    description: 'Une habitude maintenue 30 jours de suite',
    check: (ctx) => ctx.maxStreak >= 30,
  },
  {
    id: 'streak-60',
    category: 'streak',
    name: 'Deux mois',
    emoji: '🥇',
    description: '60 jours d’affilée',
    check: (ctx) => ctx.maxStreak >= 60,
  },
  {
    id: 'streak-100',
    category: 'streak',
    name: 'Centurion',
    emoji: '💎',
    description: '100 jours de suite',
    check: (ctx) => ctx.maxStreak >= 100,
  },
  {
    id: 'streak-180',
    category: 'streak',
    name: 'Six mois',
    emoji: '🌙',
    description: '180 jours d’affilée — c’est ton mode de vie',
    check: (ctx) => ctx.maxStreak >= 180,
  },
  {
    id: 'streak-365',
    category: 'streak',
    name: 'Une année',
    emoji: '🪐',
    description: '365 jours d’affilée — un exploit rare',
    check: (ctx) => ctx.maxStreak >= 365,
  },

  // ---- Volume ----
  {
    id: 'completions-50',
    category: 'volume',
    name: 'Régulier',
    emoji: '📈',
    description: '50 cochages au total',
    check: (ctx) => ctx.totalCompletions >= 50,
  },
  {
    id: 'completions-200',
    category: 'volume',
    name: 'Discipliné',
    emoji: '🎯',
    description: '200 cochages au total',
    check: (ctx) => ctx.totalCompletions >= 200,
  },
  {
    id: 'completions-500',
    category: 'volume',
    name: 'Demi-millier',
    emoji: '🚀',
    description: '500 cochages au total',
    check: (ctx) => ctx.totalCompletions >= 500,
  },
  {
    id: 'completions-1000',
    category: 'volume',
    name: 'Millénaire',
    emoji: '👑',
    description: '1000 cochages au total',
    check: (ctx) => ctx.totalCompletions >= 1000,
  },

  // ---- Diversité ----
  {
    id: 'perfect-day',
    category: 'diversity',
    name: 'Journée parfaite',
    emoji: '✨',
    description: 'Toutes les habitudes du jour cochées',
    check: (ctx) => ctx.hasPerfectDay,
  },
  {
    id: 'perfect-week',
    category: 'diversity',
    name: 'Semaine parfaite',
    emoji: '🌈',
    description: '7 journées parfaites de suite',
    check: (ctx) => ctx.perfectDayStreak >= 7,
  },
  {
    id: 'perfect-month',
    category: 'diversity',
    name: 'Mois parfait',
    emoji: '🦄',
    description: '30 journées parfaites de suite',
    check: (ctx) => ctx.perfectDayStreak >= 30,
  },
  {
    id: 'five-habits-active',
    category: 'diversity',
    name: 'Polyvalent',
    emoji: '🎨',
    description: '5 habitudes maintenues simultanément',
    check: (ctx) => ctx.activeHabitsCount >= 5,
  },

  // ---- Résilience ----
  {
    id: 'comeback',
    category: 'comeback',
    name: 'Le retour',
    emoji: '🔄',
    description: 'Reprise après 7 jours d’absence',
    check: (ctx) => ctx.hasComebackAfterBreak,
  },
  {
    id: 'big-comeback',
    category: 'comeback',
    name: 'Phénix',
    emoji: '🦅',
    description: 'Nouveau streak de 7+ jours après une rupture',
    check: (ctx) => ctx.hadBrokenLongStreakAndRebuilt,
  },

  // ---- Spéciaux ----
  {
    id: 'app-30-days',
    category: 'special',
    name: 'Un mois avec nous',
    emoji: '🎂',
    description: '30 jours d’utilisation de l’app',
    check: (ctx) => ctx.appDays >= 30,
  },
  {
    id: 'app-100-days',
    category: 'special',
    name: 'Compagnon de route',
    emoji: '🛤️',
    description: '100 jours d’utilisation de l’app',
    check: (ctx) => ctx.appDays >= 100,
  },
];

// ---- Storage helpers (using localStorage in the PWA build) ----
// Wrappers are async to keep the same API as the prototype environment
const STORAGE_PREFIX = 'habit-tracker:';

async function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function saveJSON(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage can fail (quota exceeded, private mode on some browsers).
    // We swallow silently — the app stays functional, only persistence is lost.
  }
}

export default function HabitTracker() {
  const [view, _setView] = useState('today');
  const [selectedHabitId, setSelectedHabitId] = useState(null);
  const setView = (v) => {
    _setView(v);
    setSelectedHabitId(null);
  };
  const [habits, setHabits] = useState([]);
  const [completions, setCompletions] = useState({});
  const [loading, setLoading] = useState(true);
  const [newHabit, setNewHabit] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [newSchedule, setNewSchedule] = useState(DEFAULT_SCHEDULE);
  const [, setDayTick] = useState(0);
  const [unlockedBadges, setUnlockedBadges] = useState({});
  const [recentlyUnlocked, setRecentlyUnlocked] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [notes, setNotes] = useState({}); // { 'YYYY-MM-DD': 'text' }
  const [editingNoteDate, setEditingNoteDate] = useState(null); // string 'YYYY-MM-DD' or null
  const firstBadgeCheckRef = useRef(true);

  // Theme: 'auto' | 'light' | 'dark'
  const [themeMode, setThemeMode] = useState('auto');
  const [systemPrefersDark, setSystemPrefersDark] = useState(true);

  // Watch the system preference (auto mode)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemPrefersDark(mq.matches);
    update();
    if (mq.addEventListener) mq.addEventListener('change', update);
    else mq.addListener(update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener(update);
    };
  }, []);

  const effectiveMode =
    themeMode === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : themeMode;
  const palette = effectiveMode === 'light' ? PALETTE_LIGHT : PALETTE_DARK;

  // Load on mount
  useEffect(() => {
    (async () => {
      const [h, c, b, t, n] = await Promise.all([
        loadJSON('habits', null),
        loadJSON('completions', {}),
        loadJSON('badges', {}),
        loadJSON('themeMode', 'auto'),
        loadJSON('notes', {}),
      ]);
      if (h && Array.isArray(h)) {
        // Migration : legacy 'weekly' type → 'daily' (no data loss, completions preserved)
        let needsMigrationSave = false;
        const migrated = h.map((habit) => {
          if (habit.schedule?.type === 'weekly') {
            needsMigrationSave = true;
            return { ...habit, schedule: { type: 'daily' } };
          }
          return habit;
        });
        setHabits(migrated);
        if (needsMigrationSave) await saveJSON('habits', migrated);
      } else {
        // Premiere visite : on pre-remplit avec les exemples du tableau
        const seed = [
          { id: uid(), name: "Boire 2 L d'eau", emoji: '💧', createdAt: Date.now() },
          { id: uid(), name: '30 min de sport', emoji: '🏃', createdAt: Date.now() },
          { id: uid(), name: 'Lire 20 pages', emoji: '📖', createdAt: Date.now() },
          { id: uid(), name: 'Méditer 10 min', emoji: '🧘', createdAt: Date.now() },
        ];
        setHabits(seed);
        await saveJSON('habits', seed);
      }
      setCompletions(c || {});
      setUnlockedBadges(b || {});
      setNotes(n || {});
      if (t === 'light' || t === 'dark' || t === 'auto') setThemeMode(t);
      setLoading(false);
    })();
  }, []);

  // Persist theme choice
  useEffect(() => {
    if (!loading) saveJSON('themeMode', themeMode);
  }, [themeMode, loading]);

  // Persist notes
  useEffect(() => {
    if (!loading) saveJSON('notes', notes);
  }, [notes, loading]);

  // Persist whenever habits or completions change
  useEffect(() => {
    if (!loading) saveJSON('habits', habits);
  }, [habits, loading]);
  useEffect(() => {
    if (!loading) saveJSON('completions', completions);
  }, [completions, loading]);
  useEffect(() => {
    if (!loading) saveJSON('badges', unlockedBadges);
  }, [unlockedBadges, loading]);

  // Badge check : runs whenever data changes, unlocks new badges and shows toast
  useEffect(() => {
    if (loading) return;
    const ctx = computeContext(habits, completions);
    const newly = BADGES.filter((b) => !unlockedBadges[b.id] && b.check(ctx));
    if (newly.length === 0) {
      firstBadgeCheckRef.current = false;
      return;
    }
    const updates = {};
    for (const b of newly) updates[b.id] = todayKey();
    setUnlockedBadges((prev) => ({ ...prev, ...updates }));
    // Skip toast on first run (sync from storage), only show on real new unlocks
    if (!firstBadgeCheckRef.current) {
      setRecentlyUnlocked(newly[0]);
      const t = setTimeout(() => setRecentlyUnlocked(null), 4000);
      // Cleanup if effect re-runs before timeout fires
      return () => clearTimeout(t);
    }
    firstBadgeCheckRef.current = false;
  }, [completions, habits, loading]);

  // Force a re-render at midnight (so today's view auto-resets and the date updates),
  // and also when the app becomes visible again — covers the case where the device
  // was asleep / app was backgrounded across midnight.
  useEffect(() => {
    const tick = () => setDayTick((t) => t + 1);
    let timer;
    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1, // 1 second after midnight, to be safe
      );
      timer = setTimeout(() => {
        tick();
        scheduleMidnight();
      }, nextMidnight.getTime() - now.getTime());
    };
    scheduleMidnight();

    const onResume = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, []);

  const toggle = (habitId, dateK = todayKey()) => {
    setCompletions((prev) => {
      const day = { ...(prev[dateK] || {}) };
      if (day[habitId]) delete day[habitId];
      else day[habitId] = true;
      const next = { ...prev };
      if (Object.keys(day).length === 0) delete next[dateK];
      else next[dateK] = day;
      return next;
    });
  };

  const addHabit = () => {
    const name = newHabit.trim();
    if (!name) return;
    setHabits((p) => [
      ...p,
      {
        id: uid(),
        name,
        emoji: newEmoji.trim() || '',
        schedule: newSchedule,
        createdAt: Date.now(),
      },
    ]);
    setNewHabit('');
    setNewEmoji('');
    setNewSchedule(DEFAULT_SCHEDULE);
  };

  const editHabit = (id, updates) => {
    setHabits((p) =>
      p.map((h) => {
        if (h.id !== id) return h;
        const next = { ...h };
        if (updates.name !== undefined) {
          const trimmed = updates.name.trim();
          if (trimmed) next.name = trimmed;
        }
        if (updates.emoji !== undefined) next.emoji = (updates.emoji || '').trim();
        if (updates.schedule !== undefined) next.schedule = updates.schedule;
        return next;
      }),
    );
  };

  // Reorder: move habit at fromIndex to toIndex (preserves all data)
  const reorderHabits = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setHabits((p) => {
      const next = [...p];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  // Notes: write text for a given date (empty string deletes)
  const setNote = (dateK, text) => {
    setNotes((prev) => {
      const next = { ...prev };
      if (text && text.trim()) {
        next[dateK] = text;
      } else {
        delete next[dateK];
      }
      return next;
    });
  };

  const deleteHabit = (id) => {
    setHabits((p) => p.filter((h) => h.id !== id));
    setCompletions((prev) => {
      const next = {};
      for (const k of Object.keys(prev)) {
        const { [id]: _, ...rest } = prev[k];
        if (Object.keys(rest).length) next[k] = rest;
      }
      return next;
    });
  };

  const todayDate = today();
  const todayCompletions = completions[todayKey()] || {};
  const dueToday = habits.filter((h) => isHabitDueOn(h, todayDate));
  const doneToday = dueToday.filter((h) => todayCompletions[h.id]).length;
  const total = dueToday.length;
  const pct = total ? doneToday / total : 0;

  return (
    <ThemeContext.Provider value={{ palette, mode: effectiveMode }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; background: ${palette.bg}; }
        .app-root {
          font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          font-weight: 600;
          color: ${palette.ink};
          background: ${palette.bg};
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          transition: background 0.3s ${EASE}, color 0.3s ${EASE};
        }
        .display {
          font-family: 'IBM Plex Sans', -apple-system, system-ui, sans-serif;
          font-weight: 700;
          letter-spacing: -0.022em;
        }
        .check-pop { animation: pop 0.4s ${EASE}; }
        @keyframes pop { 0% { transform: scale(0.8); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }
        .fade-in { animation: fadeIn 0.5s ${EASE} both; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .progress-fill { transition: width 0.7s ${EASE}; }
        button { font-family: inherit; font-weight: inherit; transition: transform 0.15s ${EASE}, opacity 0.15s ${EASE}; }
        button:active:not(:disabled) { transform: scale(0.97); }
        input { font-family: inherit; font-weight: inherit; }
        .scroll-area::-webkit-scrollbar { width: 0; height: 0; }
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-30px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        .badge-toast { animation: slideDown 0.5s ${EASE}; }
        .card-press { transition: transform 0.15s ${EASE}, background 0.2s ${EASE}; }
        .card-press:active { transform: scale(0.98); }
      `}</style>

      <div
        className="app-root"
        style={{
          minHeight: '100vh',
          maxWidth: 460,
          margin: '0 auto',
          paddingBottom: 96,
          background: palette.bg,
          position: 'relative',
        }}
      >
        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: C.inkMuted }}>...</div>
        ) : (
          <>
            <header
              style={{
                paddingTop: 22,
                paddingBottom: 4,
                textAlign: 'center',
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: palette.inkSoft,
              }}
            >
              À trouver
            </header>

            {editingNoteDate ? (
              <NoteView
                dateKey={editingNoteDate}
                note={notes[editingNoteDate] || ''}
                onChange={setNote}
                onBack={() => setEditingNoteDate(null)}
              />
            ) : showSettings ? (
              <SettingsView
                themeMode={themeMode}
                setThemeMode={setThemeMode}
                onBack={() => setShowSettings(false)}
                habits={habits}
                completions={completions}
                unlockedBadges={unlockedBadges}
                notes={notes}
                onImport={(data) => {
                  setHabits(Array.isArray(data.habits) ? data.habits : []);
                  setCompletions(data.completions || {});
                  setUnlockedBadges(data.unlockedBadges || {});
                  if (data.notes && typeof data.notes === 'object') setNotes(data.notes);
                }}
              />
            ) : selectedHabitId ? (
              (() => {
                const selectedHabit = habits.find((h) => h.id === selectedHabitId);
                if (!selectedHabit) {
                  // Habit deleted while on stats view → fall back
                  setSelectedHabitId(null);
                  return null;
                }
                return (
                  <HabitStatsView
                    habit={selectedHabit}
                    completions={completions}
                    onBack={() => setSelectedHabitId(null)}
                  />
                );
              })()
            ) : (
              <>
                {view === 'today' && (
                  <TodayView
                    habits={dueToday}
                    allHabits={habits}
                    completions={completions}
                    doneToday={doneToday}
                    total={total}
                    pct={pct}
                    onToggle={toggle}
                    onSelectHabit={setSelectedHabitId}
                    onOpenSettings={() => setShowSettings(true)}
                    onOpenNote={() => setEditingNoteDate(todayKey())}
                    hasNoteToday={!!notes[todayKey()]}
                  />
                )}
                {view === 'week' && (
                  <WeekView
                    habits={habits}
                    completions={completions}
                    notes={notes}
                    onOpenNote={(dateK) => setEditingNoteDate(dateK)}
                  />
                )}
                {view === 'habits' && (
                  <HabitsView
                    habits={habits}
                    onDelete={deleteHabit}
                    onAdd={addHabit}
                    onEdit={editHabit}
                    onReorder={reorderHabits}
                    newHabit={newHabit}
                    setNewHabit={setNewHabit}
                    newEmoji={newEmoji}
                    setNewEmoji={setNewEmoji}
                    newSchedule={newSchedule}
                    setNewSchedule={setNewSchedule}
                  />
                )}
                {view === 'badges' && (
                  <BadgesView
                    habits={habits}
                    completions={completions}
                    unlockedBadges={unlockedBadges}
                  />
                )}
              </>
            )}

            {/* Toast notification quand un badge est débloqué */}
            {recentlyUnlocked && (
              <div
                className="badge-toast"
                style={{
                  position: 'fixed',
                  top: 80,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: palette.surface,
                  border: `1.5px solid ${palette.sage}`,
                  borderRadius: 16,
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  zIndex: 100,
                  boxShadow: `0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 4px ${palette.sageBg}`,
                  maxWidth: 320,
                }}
              >
                <span style={{ fontSize: 32 }}>{recentlyUnlocked.emoji}</span>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: palette.sage,
                      fontWeight: 700,
                      letterSpacing: '1.2px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Badge débloqué
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: palette.ink, marginTop: 2 }}>
                    {recentlyUnlocked.name}
                  </div>
                </div>
              </div>
            )}

            <BottomNav view={view} setView={setView} />
          </>
        )}
      </div>
    </ThemeContext.Provider>
  );
}

// ============================================================
// TODAY VIEW
// ============================================================
function TodayView({ habits, allHabits, completions, doneToday, total, pct, onToggle, onSelectHabit, onOpenSettings, onOpenNote, hasNoteToday }) {
  const { palette: C } = useTheme();
  const todayC = completions[todayKey()] || {};

  return (
    <div className="fade-in" style={{ padding: `${S.xxxl}px ${S.xl}px ${S.xl}px` }}>
      {/* Date + settings gear */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: C.inkMuted,
            fontWeight: 700,
          }}
        >
          {longDate(today())}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {onOpenNote && (
            <button
              onClick={onOpenNote}
              aria-label="Note du jour"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: hasNoteToday ? C.sageBg : C.surface,
                border: 'none',
                color: hasNoteToday ? C.sage : C.inkSoft,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <NotebookPen size={17} strokeWidth={2.2} />
              {hasNoteToday && (
                <span
                  style={{
                    position: 'absolute',
                    top: 7,
                    right: 7,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: C.sage,
                    boxShadow: `0 0 0 2px ${C.sageBg}`,
                  }}
                />
              )}
            </button>
          )}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              aria-label="Paramètres"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: C.surface,
                border: 'none',
                color: C.inkSoft,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Settings size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>

      {/* Big stat */}
      <div style={{ marginTop: S.lg, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span
          className="display"
          style={{ fontSize: 72, lineHeight: 0.95, color: C.ink, letterSpacing: '-0.04em' }}
        >
          {doneToday}
        </span>
        <span
          className="display"
          style={{ fontSize: 32, color: C.inkMuted, fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          / {total}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 14,
            color: C.inkSoft,
            fontWeight: 700,
            background: C.surface,
            padding: '6px 12px',
            borderRadius: R.full,
          }}
        >
          {Math.round(pct * 100)}%
        </span>
      </div>
      <div style={{ marginTop: S.sm, fontSize: 16, color: C.inkSoft, fontWeight: 500 }}>
        {allHabits && allHabits.length === 0
          ? 'Ajoute ta première habitude pour commencer'
          : total === 0
          ? 'Rien de prévu aujourd’hui — repos mérité 🌿'
          : doneToday === total
          ? 'Bravo, tout est fait pour aujourd’hui ✨'
          : doneToday === 0
          ? 'Allez, on commence'
          : `Plus que ${total - doneToday} à faire`}
      </div>

      {/* Progress bar */}
      <div
        style={{
          marginTop: S.xl,
          height: 14,
          borderRadius: R.full,
          background: C.surface,
          overflow: 'hidden',
        }}
      >
        <div
          className="progress-fill"
          style={{
            width: `${pct * 100}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${C.sage}, ${C.sageDeep})`,
            borderRadius: R.full,
            boxShadow: pct > 0 ? `0 0 12px ${C.sage}55` : 'none',
          }}
        />
      </div>

      {/* Habits */}
      <div style={{ marginTop: S.xxl, display: 'flex', flexDirection: 'column', gap: S.md }}>
        {habits.length === 0 ? (
          allHabits && allHabits.length === 0 ? (
            <EmptyState />
          ) : null
        ) : (
          habits.map((h) => {
            const done = !!todayC[h.id];
            const streak = computeStreak(h, completions);
            const best = computeBestStreak(h, completions);
            const sched = getSchedule(h);
            const weeklyCount =
              sched.type === 'weekly'
                ? weeklyCompletionCount(h, completions, today())
                : null;
            return (
              <div
                key={h.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: done ? C.sageBg : C.surface,
                  border: 'none',
                  borderRadius: R.lg,
                  transition: `background 0.3s ${EASE}, transform 0.2s ${EASE}`,
                  overflow: 'hidden',
                  boxShadow: done
                    ? `0 0 0 1px ${C.sageLight}, 0 4px 16px rgba(48, 209, 88, 0.08)`
                    : '0 1px 3px rgba(0, 0, 0, 0.3)',
                }}
              >
                {/* Zone 1 : tap pour cocher */}
                <button
                  onClick={() => onToggle(h.id)}
                  aria-label={done ? 'Décocher' : 'Cocher'}
                  
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: `${S.xl}px 6px ${S.xl}px ${S.xl}px`,
                    display: 'flex',
                    alignItems: 'center',
                    outline: 'none',
                  }}
                >
                  <CheckCircle done={done} />
                </button>

                {/* Zone 2 : tap pour ouvrir les stats de l'habitude */}
                <button
                  onClick={() => onSelectHabit && onSelectHabit(h.id)}
                  
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: `${S.xl}px ${S.xl}px ${S.xl}px ${S.md}px`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    textAlign: 'left',
                    outline: 'none',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: C.ink,
                        textDecoration: done ? 'line-through' : 'none',
                        textDecorationColor: C.inkMuted,
                        textDecorationThickness: 1,
                        opacity: done ? 0.6 : 1,
                        transition: 'opacity 0.25s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {h.emoji && <span style={{ fontSize: 18 }}>{h.emoji}</span>}
                      <span>{h.name}</span>
                    </div>
                    {(streak > 0 || best > 0 || weeklyCount !== null) && (
                      <div
                        style={{
                          marginTop: 6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        {weeklyCount !== null && (
                          <div
                            style={{
                              fontSize: 13,
                              color: weeklyCount >= sched.count ? C.sage : C.inkSoft,
                              fontWeight: 700,
                            }}
                          >
                            {weeklyCount} / {sched.count} cette semaine
                          </div>
                        )}
                        {streak > 0 && (
                          <div
                            style={{
                              fontSize: 13,
                              color: C.flame,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Flame size={14} fill={C.flame} strokeWidth={0} />
                            {streak}{' '}
                            {sched.type === 'weekly'
                              ? 'sem'
                              : streak === 1
                              ? 'jour'
                              : 'jours'}
                          </div>
                        )}
                        {best > streak && best > 0 && (
                          <div
                            style={{
                              fontSize: 12,
                              color: C.inkMuted,
                              fontWeight: 700,
                              letterSpacing: '0.3px',
                            }}
                          >
                            record : {best}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} color={C.inkMuted} strokeWidth={2.5} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================================
// HABIT STATS VIEW (per-habit detail)
// ============================================================
function HabitStatsView({ habit, completions, onBack }) {
  const { palette: C } = useTheme();
  const sched = getSchedule(habit);
  const streak = computeStreak(habit, completions);
  const best = computeBestStreak(habit, completions);

  // Total completions for this habit (all time)
  const totalCompletions = Object.values(completions).filter((day) => day?.[habit.id]).length;

  // Completion rate over due days since creation
  const todayDate = today();
  const startDate = habit.createdAt
    ? new Date(habit.createdAt)
    : new Date(todayDate.getTime() - 30 * 86400000);
  startDate.setHours(0, 0, 0, 0);

  let dueDays = 0;
  let completedDays = 0;
  let cur = new Date(startDate);
  while (cur <= todayDate) {
    if (isHabitDueOn(habit, cur)) {
      dueDays++;
      if (completions[dateKey(cur)]?.[habit.id]) completedDays++;
    }
    cur = addDays(cur, 1);
  }
  const completionRate = dueDays > 0 ? completedDays / dueDays : 0;

  // 12-week heatmap : 12 columns (weeks) x 7 rows (days, Mon→Sun)
  const heatmapStart = startOfWeek(addDays(todayDate, -7 * 11));
  const heatmapWeeks = [];
  for (let w = 0; w < 12; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(heatmapStart, w * 7 + d);
      const isFuture = date.getTime() > todayDate.getTime();
      const isDue = isHabitDueOn(habit, date);
      const isDone = !!completions[dateKey(date)]?.[habit.id];
      week.push({ date, isFuture, isDue, isDone });
    }
    heatmapWeeks.push(week);
  }

  // 6-month bar chart
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(todayDate.getFullYear(), todayDate.getMonth() - i, 1);
    let dueInMonth = 0;
    let completedInMonth = 0;
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dt = new Date(d.getFullYear(), d.getMonth(), day);
      if (dt > todayDate) break;
      if (isHabitDueOn(habit, dt)) {
        dueInMonth++;
        if (completions[dateKey(dt)]?.[habit.id]) completedInMonth++;
      }
    }
    months.push({
      label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      rate: dueInMonth > 0 ? completedInMonth / dueInMonth : 0,
      completed: completedInMonth,
      due: dueInMonth,
    });
  }

  const noData = totalCompletions === 0;

  return (
    <div className="fade-in" style={{ padding: `${S.lg}px ${S.xl}px ${S.xl}px` }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: C.surface,
          border: 'none',
          borderRadius: R.full,
          padding: '8px 16px 8px 10px',
          color: C.ink,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          fontWeight: 700,
        }}
        aria-label="Retour"
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
        Retour
      </button>

      {/* Header */}
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
        {habit.emoji && <span style={{ fontSize: 36 }}>{habit.emoji}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="display" style={{ fontSize: 26, color: C.ink, lineHeight: 1.15 }}>
            {habit.name}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: C.inkMuted,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {scheduleLabel(habit)}
          </div>
        </div>
      </div>

      {noData ? (
        <div
          style={{
            marginTop: 32,
            padding: '32px 20px',
            background: C.surface,
            border: `1px dashed ${C.border}`,
            borderRadius: 16,
            textAlign: 'center',
            color: C.inkSoft,
          }}
        >
          <div className="display" style={{ fontSize: 20, color: C.ink }}>
            Pas encore de données
          </div>
          <div style={{ marginTop: 6, fontSize: 14 }}>
            Coche cette habitude au moins une fois pour voir ses statistiques.
          </div>
        </div>
      ) : (
        <>
          {/* Stats grid 2x2 */}
          <div
            style={{
              marginTop: 26,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 10,
            }}
          >
            <StatCard
              label="Streak actuel"
              value={streak}
              suffix={sched.type === 'weekly' ? (streak > 1 ? 'semaines' : 'semaine') : streak > 1 ? 'jours' : 'jour'}
              accent={C.flame}
              icon={<Flame size={14} fill={C.flame} strokeWidth={0} />}
            />
            <StatCard
              label="Record"
              value={best}
              suffix={sched.type === 'weekly' ? (best > 1 ? 'semaines' : 'semaine') : best > 1 ? 'jours' : 'jour'}
              accent={C.inkSoft}
            />
            <StatCard
              label="Total fait"
              value={totalCompletions}
              suffix={totalCompletions > 1 ? 'fois' : 'fois'}
              accent={C.sage}
            />
            <StatCard
              label="Taux"
              value={Math.round(completionRate * 100)}
              suffix="%"
              accent={C.sage}
              hint={`${completedDays} / ${dueDays} jours dus`}
            />
          </div>

          {/* Heatmap */}
          <div style={{ marginTop: 32 }}>
            <SectionTitle>12 dernières semaines</SectionTitle>
            <div style={{ marginTop: 14, display: 'flex', gap: 6 }}>
              {/* Day labels (Lu→Di, Monday-first) */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  paddingTop: 1,
                  fontSize: 10,
                  color: C.inkMuted,
                  fontWeight: 700,
                  width: 22,
                }}
              >
                {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map((l, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {l}
                  </div>
                ))}
              </div>
              {/* Week columns */}
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 3 }}>
                {heatmapWeeks.map((week, wi) => (
                  <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {week.map((cell, di) => {
                      let bg = 'transparent';
                      let border = `1px solid ${C.borderSoft}`;
                      let opacity = 1;
                      if (cell.isFuture) {
                        opacity = 0.25;
                      } else if (!cell.isDue) {
                        bg = 'transparent';
                        border = `1px dashed ${C.borderSoft}`;
                        opacity = 0.5;
                      } else if (cell.isDone) {
                        bg = C.sage;
                        border = 'none';
                      } else {
                        bg = C.surfaceAlt;
                        border = `1px solid ${C.border}`;
                      }
                      return (
                        <div
                          key={di}
                          style={{
                            aspectRatio: '1 / 1',
                            background: bg,
                            border,
                            borderRadius: 4,
                            opacity,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 6-month bar chart */}
          <div style={{ marginTop: 32 }}>
            <SectionTitle>6 derniers mois</SectionTitle>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {months.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      fontSize: 12,
                      color: C.inkSoft,
                      fontWeight: 700,
                      textTransform: 'capitalize',
                    }}
                  >
                    {m.label}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      height: 18,
                      background: C.surfaceAlt,
                      borderRadius: 6,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      className="progress-fill"
                      style={{
                        width: `${m.rate * 100}%`,
                        height: '100%',
                        background: m.due > 0
                          ? `linear-gradient(90deg, ${C.sageLight}, ${C.sage})`
                          : C.borderSoft,
                        borderRadius: 6,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      width: 56,
                      textAlign: 'right',
                      fontSize: 12,
                      color: m.due === 0 ? C.inkMuted : C.ink,
                      fontWeight: 700,
                    }}
                  >
                    {m.due === 0 ? '—' : `${Math.round(m.rate * 100)}%`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, suffix, accent, icon, hint }) {
  const { palette: C } = useTheme();
  if (!accent) accent = C.ink;
  return (
    <div
      style={{
        background: C.surface,
        border: 'none',
        borderRadius: R.lg,
        padding: S.lg,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: C.inkMuted,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: S.xs, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {icon && <span style={{ display: 'inline-flex', alignSelf: 'center' }}>{icon}</span>}
        <span
          className="display"
          style={{ fontSize: 32, color: accent, lineHeight: 1, letterSpacing: '-0.03em' }}
        >
          {value}
        </span>
        <span style={{ fontSize: 12, color: C.inkSoft, fontWeight: 700 }}>{suffix}</span>
      </div>
      {hint && (
        <div style={{ marginTop: S.xs, fontSize: 11, color: C.inkMuted, fontWeight: 700 }}>{hint}</div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  const { palette: C } = useTheme();
  return (
    <div
      style={{
        fontSize: 12,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: C.inkMuted,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

function CheckCircle({ done }) {
  const { palette: C } = useTheme();
  return (
    <div
      className={done ? 'check-pop' : ''}
      style={{
        width: 30,
        height: 30,
        flexShrink: 0,
        borderRadius: '50%',
        border: done ? `none` : `2.5px solid ${C.border}`,
        background: done ? C.sage : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `all 0.25s ${EASE}`,
        boxShadow: done ? `0 0 0 4px ${C.sage}22` : 'none',
      }}
    >
      {done && <Check size={17} color="#fff" strokeWidth={3.5} />}
    </div>
  );
}

function EmptyState() {
  const { palette: C } = useTheme();
  return (
    <div
      style={{
        padding: '40px 20px',
        textAlign: 'center',
        background: C.surface,
        border: `1px dashed ${C.border}`,
        borderRadius: 16,
        color: C.inkSoft,
      }}
    >
      <div className="display" style={{ fontSize: 22, color: C.ink }}>
        Aucune habitude
      </div>
      <div style={{ marginTop: 6, fontSize: 14 }}>
        Va dans l’onglet « Habitudes » pour en ajouter
      </div>
    </div>
  );
}

// ============================================================
// WEEK VIEW
// ============================================================
function WeekView({ habits, completions, notes, onOpenNote }) {
  const { palette: C } = useTheme();
  const [mode, setMode] = useState('week');
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current, -1 = previous, etc.

  return (
    <div className="fade-in" style={{ padding: '32px 22px 24px' }}>
      <div
        style={{
          fontSize: 13,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: C.inkMuted,
          fontWeight: 700,
        }}
      >
        Vue
      </div>

      {/* Segmented switcher : Semaine | Mois */}
      <div
        style={{
          marginTop: 10,
          display: 'inline-flex',
          padding: 4,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          gap: 2,
        }}
      >
        {[
          { id: 'week', label: 'Semaine' },
          { id: 'month', label: 'Mois' },
        ].map((opt) => {
          const active = mode === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setMode(opt.id)}
              style={{
                padding: '8px 18px',
                borderRadius: 9,
                border: 'none',
                background: active ? C.sage : 'transparent',
                color: active ? '#fff' : C.inkSoft,
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {mode === 'week' ? (
        <WeekContent habits={habits} completions={completions} />
      ) : (
        <MonthContent
          habits={habits}
          completions={completions}
          monthOffset={monthOffset}
          setMonthOffset={setMonthOffset}
          notes={notes}
          onOpenNote={onOpenNote}
        />
      )}
    </div>
  );
}

// ---- Week mode content ----
function WeekContent({ habits, completions }) {
  const { palette: C } = useTheme();
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(today(), -i));

  return (
    <>
      <div
        className="display"
        style={{ marginTop: 18, fontSize: 28, color: C.ink, lineHeight: 1.1 }}
      >
        7 derniers jours
      </div>

      {/* Daily progress strip */}
      <div style={{ marginTop: 24, display: 'flex', gap: 6 }}>
        {days.map((d) => {
          const k = dateKey(d);
          const dueOnDay = habits.filter((h) => isHabitDueOn(h, d));
          const done = dueOnDay.filter((h) => completions[k]?.[h.id]).length;
          const pct = dueOnDay.length ? done / dueOnDay.length : 0;
          const isToday = k === todayKey();
          return (
            <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 11, color: C.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                {shortDay(d)}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: isToday ? C.sage : C.ink,
                }}
              >
                {dayNum(d)}
              </div>
              <div
                style={{
                  width: '100%',
                  height: 60,
                  background: C.surfaceAlt,
                  borderRadius: 8,
                  overflow: 'hidden',
                  position: 'relative',
                  border: isToday ? `1.5px solid ${C.sage}` : 'none',
                }}
              >
                <div
                  className="progress-fill"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${pct * 100}%`,
                    background: `linear-gradient(180deg, ${C.sageLight}, ${C.sage})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-habit grid */}
      {habits.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div
            style={{
              fontSize: 13,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: C.inkMuted,
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            Par habitude
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {habits.map((h) => (
              <div key={h.id}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: C.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {h.emoji && <span>{h.emoji}</span>}
                  <span>{h.name}</span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: C.inkMuted,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  {scheduleLabel(h)}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {days.map((d) => {
                    const k = dateKey(d);
                    const done = !!completions[k]?.[h.id];
                    const isToday = k === todayKey();
                    const isDue = isHabitDueOn(h, d);
                    return (
                      <div key={k} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                        <div
                          aria-label={
                            !isDue
                              ? `Pas prévu le ${shortDay(d)} ${dayNum(d)}`
                              : done
                              ? `Fait le ${shortDay(d)} ${dayNum(d)}`
                              : `Non fait le ${shortDay(d)} ${dayNum(d)}`
                          }
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: done ? C.sage : 'transparent',
                            border: done
                              ? 'none'
                              : `1.5px ${isDue ? 'solid' : 'dashed'} ${
                                  isDue ? C.border : C.borderSoft
                                }`,
                            opacity: !isDue && !done ? 0.4 : 1,
                            boxShadow:
                              isToday && !done && isDue ? `0 0 0 2px ${C.sageBg}` : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {done && <Check size={11} color="#fff" strokeWidth={3.5} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ---- Month mode content ----
function MonthContent({ habits, completions, monthOffset, setMonthOffset, notes, onOpenNote }) {
  const { palette: C } = useTheme();
  const now = today();
  const refDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = refDate.getFullYear();
  const month = refDate.getMonth();

  // Build 6-week grid starting from the Monday of the week containing day 1
  const firstDay = new Date(year, month, 1);
  const offsetToMonday = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - offsetToMonday);
  const gridDays = [];
  for (let i = 0; i < 42; i++) gridDays.push(addDays(gridStart, i));

  const monthName = refDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const todayK = todayKey();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthDays = gridDays.filter((d) => d.getMonth() === month);

  // Stats for the month - computed only over days where at least one habit was due
  const pastMonthDays = monthDays.filter((d) => d.getTime() <= todayMs);
  let totalRate = 0;
  if (habits.length > 0 && pastMonthDays.length > 0) {
    let sumRates = 0;
    let countedDays = 0;
    for (const d of pastMonthDays) {
      const dueOnDay = habits.filter((h) => isHabitDueOn(h, d));
      if (dueOnDay.length === 0) continue;
      const k = dateKey(d);
      const doneOnDay = dueOnDay.filter((h) => completions[k]?.[h.id]).length;
      sumRates += doneOnDay / dueOnDay.length;
      countedDays++;
    }
    totalRate = countedDays > 0 ? sumRates / countedDays : 0;
  }

  const weekdayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  return (
    <>
      {/* Month nav */}
      <div
        style={{
          marginTop: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <button
          onClick={() => setMonthOffset((o) => o - 1)}
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 8,
            color: C.ink,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Mois précédent"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <div
          className="display"
          style={{
            fontSize: 24,
            color: C.ink,
            textTransform: 'capitalize',
            textAlign: 'center',
            flex: 1,
          }}
        >
          {monthName}
        </div>
        <button
          onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
          disabled={monthOffset >= 0}
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 8,
            color: monthOffset >= 0 ? C.inkMuted : C.ink,
            cursor: monthOffset >= 0 ? 'not-allowed' : 'pointer',
            opacity: monthOffset >= 0 ? 0.4 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Mois suivant"
        >
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </div>

      {/* Mini stats row */}
      <div
        style={{
          marginTop: 14,
          fontSize: 13,
          color: C.inkSoft,
          fontWeight: 700,
          display: 'flex',
          gap: 12,
        }}
      >
        <span>
          Moyenne du mois :{' '}
          <span style={{ color: C.sage }}>{Math.round(totalRate * 100)}%</span>
        </span>
      </div>

      {/* Weekday labels */}
      <div
        style={{
          marginTop: 22,
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
          marginBottom: 6,
        }}
      >
        {weekdayLabels.map((l, i) => (
          <div
            key={i}
            style={{
              fontSize: 11,
              color: C.inkMuted,
              fontWeight: 700,
              textAlign: 'center',
              letterSpacing: 0.5,
            }}
          >
            {l}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
        }}
      >
        {gridDays.map((d) => {
          const k = dateKey(d);
          const inMonth = d.getMonth() === month;
          const isToday = k === todayK;
          const isFuture = d.getTime() > todayMs;
          const dayCompletions = completions[k];
          const dueOnDay = habits.filter((h) => isHabitDueOn(h, d));
          const noneDue = inMonth && !isFuture && dueOnDay.length === 0 && habits.length > 0;
          const rate =
            dueOnDay.length && dayCompletions && !isFuture
              ? dueOnDay.filter((h) => dayCompletions[h.id]).length / dueOnDay.length
              : 0;
          const hasNote = !!(notes && notes[k]);
          const isClickable = inMonth && !isFuture && !!onOpenNote;

          // Background fill : transparent for empty days, sage with opacity for filled
          let background = 'transparent';
          if (inMonth && !isFuture) {
            if (noneDue) background = C.borderSoft;
            else if (rate === 0) background = C.surfaceAlt;
            else background = `rgba(34, 197, 94, ${0.2 + rate * 0.7})`;
          }

          const cellStyle = {
            aspectRatio: '1 / 1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            background,
            border: isToday ? `1.5px solid ${C.sage}` : 'none',
            opacity: !inMonth ? 0.18 : isFuture ? 0.35 : noneDue ? 0.5 : 1,
            fontSize: 13,
            fontWeight: 700,
            color: rate > 0.5 ? '#fff' : C.ink,
            position: 'relative',
            cursor: isClickable ? 'pointer' : 'default',
            padding: 0,
            outline: 'none',
          };

          const content = (
            <>
              {d.getDate()}
              {hasNote && inMonth && !isFuture && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: rate > 0.5 ? '#fff' : C.sage,
                  }}
                />
              )}
            </>
          );

          if (isClickable) {
            return (
              <button
                key={k}
                onClick={() => onOpenNote(k)}
                style={cellStyle}
                aria-label={`Ouvrir la note du ${d.getDate()}`}
              >
                {content}
              </button>
            );
          }
          return (
            <div key={k} style={cellStyle}>
              {content}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          marginTop: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 6,
          fontSize: 11,
          color: C.inkMuted,
          fontWeight: 700,
        }}
      >
        <span>Moins</span>
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <div
            key={r}
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              background: r === 0 ? C.surfaceAlt : `rgba(34, 197, 94, ${0.2 + r * 0.7})`,
            }}
          />
        ))}
        <span>Plus</span>
      </div>
    </>
  );
}

// ============================================================
// SCHEDULE EDITOR (reusable)
// ============================================================
function ScheduleEditor({ schedule, onChange, compact = false }) {
  const { palette: C } = useTheme();
  const s = schedule || DEFAULT_SCHEDULE;
  const labels = ['L', 'M', 'M', 'J', 'V', 'S', 'D']; // Mon..Sun for display
  const dayIdxMap = [1, 2, 3, 4, 5, 6, 0]; // map display index -> Date.getDay() index

  const setType = (type) => {
    if (type === 'daily') onChange({ type: 'daily' });
    else if (type === 'weekdays') onChange({ type: 'weekdays', days: s.days || [1, 2, 3, 4, 5] });
  };

  const toggleDay = (dow) => {
    const days = (s.days || []).includes(dow)
      ? s.days.filter((d) => d !== dow)
      : [...(s.days || []), dow];
    onChange({ ...s, days });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Type segmented switcher */}
      <div
        style={{
          display: 'inline-flex',
          padding: 4,
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          gap: 2,
          width: '100%',
        }}
      >
        {[
          { id: 'daily', label: 'Quotidien' },
          { id: 'weekdays', label: 'Jours précis' },
        ].map((opt) => {
          const active = s.type === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setType(opt.id)}
              style={{
                flex: 1,
                padding: '7px 4px',
                borderRadius: 7,
                border: 'none',
                background: active ? C.sage : 'transparent',
                color: active ? '#fff' : C.inkSoft,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Sub-controls depending on type */}
      {s.type === 'weekdays' && (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
          {labels.map((l, i) => {
            const dow = dayIdxMap[i];
            const active = (s.days || []).includes(dow);
            return (
              <button
                key={i}
                onClick={() => toggleDay(dow)}
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: 8,
                  border: `1.5px solid ${active ? C.sage : C.border}`,
                  background: active ? C.sage : 'transparent',
                  color: active ? '#fff' : C.inkSoft,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {l}
              </button>
            );
          })}
        </div>
      )}

      {s.type === 'weekdays' && (s.days || []).length === 0 && (
        <div style={{ fontSize: 11, color: C.flame, fontWeight: 700 }}>
          Sélectionne au moins un jour
        </div>
      )}
    </div>
  );
}

// ============================================================
// HABITS VIEW
// ============================================================
function HabitsView({
  habits,
  onDelete,
  onAdd,
  onEdit,
  onReorder,
  newHabit,
  setNewHabit,
  newEmoji,
  setNewEmoji,
  newSchedule,
  setNewSchedule,
}) {
  const { palette: C } = useTheme();
  const [confirmingId, setConfirmingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editSchedule, setEditSchedule] = useState(DEFAULT_SCHEDULE);
  const [originalValues, setOriginalValues] = useState(null);

  // ---- Drag & drop state ----
  const [draggingIndex, setDraggingIndex] = useState(null); // index of item being dragged
  const [dragOverIndex, setDragOverIndex] = useState(null); // index where it would drop
  const [dragY, setDragY] = useState(0); // current pointer Y offset relative to start
  const dragStartRef = useRef({ y: 0, itemHeight: 0, startIndex: 0 });
  const longPressTimerRef = useRef(null);
  const itemRefs = useRef(new Map()); // index -> DOM node
  const listRef = useRef(null);

  // Cancel any pending long-press if state changes
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const startDrag = (index, clientY) => {
    const node = itemRefs.current.get(index);
    if (!node) return;
    const rect = node.getBoundingClientRect();
    dragStartRef.current = {
      y: clientY,
      itemHeight: rect.height + 8, // +8 ≈ gap between items
      startIndex: index,
    };
    setDraggingIndex(index);
    setDragOverIndex(index);
    setDragY(0);
    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handlePointerDown = (e, index) => {
    // Don't start drag if user is interacting with a button or in edit mode
    if (editingId !== null) return;
    if (e.target.closest('button')) return;
    const clientY = e.clientY;
    longPressTimerRef.current = setTimeout(() => {
      startDrag(index, clientY);
    }, 400);
  };

  const handlePointerMove = (e) => {
    // Cancel pending long-press if pointer moves before threshold
    if (longPressTimerRef.current && draggingIndex === null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (draggingIndex === null) return;
    e.preventDefault();
    const dy = e.clientY - dragStartRef.current.y;
    setDragY(dy);
    // Compute target index based on offset
    const indexDelta = Math.round(dy / dragStartRef.current.itemHeight);
    const newIndex = Math.max(
      0,
      Math.min(habits.length - 1, dragStartRef.current.startIndex + indexDelta),
    );
    setDragOverIndex(newIndex);
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (draggingIndex !== null && dragOverIndex !== null && draggingIndex !== dragOverIndex) {
      onReorder(draggingIndex, dragOverIndex);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
    setDragY(0);
  };

  const startEdit = (h) => {
    setConfirmingId(null);
    setEditingId(h.id);
    setEditName(h.name);
    setEditEmoji(h.emoji || '');
    setEditSchedule(getSchedule(h));
    setOriginalValues({
      name: h.name,
      emoji: h.emoji || '',
      schedule: getSchedule(h),
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditEmoji('');
    setEditSchedule(DEFAULT_SCHEDULE);
    setOriginalValues(null);
  };
  const saveEdit = () => {
    if (!editName.trim()) return;
    if (!originalValues) {
      cancelEdit();
      return;
    }
    // Only persist fields that actually changed (safer)
    const updates = {};
    if (editName.trim() !== originalValues.name) updates.name = editName;
    if (editEmoji !== originalValues.emoji) updates.emoji = editEmoji;
    if (JSON.stringify(editSchedule) !== JSON.stringify(originalValues.schedule)) {
      updates.schedule = editSchedule;
    }
    if (Object.keys(updates).length > 0) {
      onEdit(editingId, updates);
    }
    cancelEdit();
  };

  // Auto-cancel confirmation after 2.5s if user doesn't act
  useEffect(() => {
    if (!confirmingId) return;
    const t = setTimeout(() => setConfirmingId(null), 2500);
    return () => clearTimeout(t);
  }, [confirmingId]);

  return (
    <div className="fade-in" style={{ padding: '32px 22px 24px' }}>
      <div
        style={{
          fontSize: 13,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: C.inkMuted,
          fontWeight: 700,
        }}
      >
        Gestion
      </div>
      <div
        className="display"
        style={{ marginTop: 8, fontSize: 32, color: C.ink, lineHeight: 1.1 }}
      >
        Mes habitudes
      </div>

      {/* Add form */}
      <div
        style={{
          marginTop: S.xl,
          padding: S.lg,
          background: C.surface,
          border: 'none',
          borderRadius: R.xl,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <input
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value.slice(0, 2))}
            placeholder="🎯"
            style={{
              width: 52,
              fontSize: 18,
              textAlign: 'center',
              border: 'none',
              background: C.surfaceAlt,
              borderRadius: R.sm,
              padding: '12px 4px',
              outline: 'none',
              color: C.ink,
            }}
          />
          <input
            value={newHabit}
            onChange={(e) => setNewHabit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            placeholder="Nouvelle habitude..."
            style={{
              flex: 1,
              fontSize: 15,
              border: 'none',
              background: C.surfaceAlt,
              borderRadius: R.sm,
              padding: '12px 14px',
              outline: 'none',
              color: C.ink,
            }}
          />
          <button
            onClick={onAdd}
            disabled={!newHabit.trim()}
            style={{
              background: newHabit.trim() ? C.sage : C.surfaceAlt,
              color: newHabit.trim() ? '#fff' : C.inkMuted,
              border: 'none',
              borderRadius: R.sm,
              padding: '0 16px',
              cursor: newHabit.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              transition: `all 0.2s ${EASE}`,
              boxShadow: newHabit.trim() ? `0 0 16px ${C.sage}33` : 'none',
            }}
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
        <div style={{ marginTop: S.lg, paddingTop: S.lg, borderTop: `1px solid ${C.borderSoft}` }}>
          <div
            style={{
              fontSize: 11,
              color: C.inkMuted,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: S.sm,
            }}
          >
            Fréquence
          </div>
          <ScheduleEditor schedule={newSchedule} onChange={setNewSchedule} />
        </div>
      </div>

      {/* List */}
      {habits.length >= 2 && (
        <div
          style={{
            marginTop: 18,
            fontSize: 11,
            color: C.inkMuted,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          Maintenez pour réorganiser
        </div>
      )}
      <div
        ref={listRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(e) => {
          // Only end drag if pointer leaves while NOT pressed
          if (draggingIndex === null) handlePointerUp();
        }}
        style={{ marginTop: habits.length >= 2 ? 8 : 24, display: 'flex', flexDirection: 'column', gap: 8, touchAction: draggingIndex !== null ? 'none' : 'auto' }}
      >
        {habits.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.inkMuted, fontSize: 14 }}>
            Aucune habitude pour l’instant
          </div>
        ) : (
          habits.map((h, index) => {
            const isEditing = editingId === h.id;
            const isDragging = draggingIndex === index;
            // Compute visual offset for non-dragged items when something is being dragged over
            let translateY = 0;
            if (draggingIndex !== null && !isDragging) {
              const from = draggingIndex;
              const to = dragOverIndex;
              if (from !== null && to !== null) {
                if (from < to && index > from && index <= to) {
                  // dragged item moving down, items in between shift up
                  translateY = -(dragStartRef.current.itemHeight);
                } else if (from > to && index < from && index >= to) {
                  // dragged item moving up, items in between shift down
                  translateY = dragStartRef.current.itemHeight;
                }
              }
            }
            return (
              <div
                key={h.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(index, el);
                  else itemRefs.current.delete(index);
                }}
                onPointerDown={(e) => handlePointerDown(e, index)}
                style={{
                  padding: `${S.lg}px ${S.lg}px`,
                  background: isEditing
                    ? C.surfaceAlt
                    : isDragging
                    ? C.sageBg
                    : C.surface,
                  border: 'none',
                  borderRadius: R.lg,
                  transform: isDragging
                    ? `translateY(${dragY}px) scale(1.02)`
                    : `translateY(${translateY}px)`,
                  transition: isDragging ? 'none' : `transform 0.25s ${EASE}, background 0.2s ${EASE}`,
                  zIndex: isDragging ? 10 : 1,
                  position: 'relative',
                  boxShadow: isDragging
                    ? `0 16px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px ${C.sage}`
                    : isEditing
                    ? `0 0 0 1px ${C.sage}`
                    : '0 1px 3px rgba(0, 0, 0, 0.3)',
                  cursor: draggingIndex === null ? 'grab' : isDragging ? 'grabbing' : 'default',
                  userSelect: 'none',
                  touchAction: 'pan-y',
                }}
              >
                {isEditing ? (
                  // ----- Edit mode -----
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={editEmoji}
                        onChange={(e) => setEditEmoji(e.target.value.slice(0, 2))}
                        placeholder="🎯"
                        style={{
                          width: 52,
                          fontSize: 18,
                          textAlign: 'center',
                          border: `1px solid ${C.border}`,
                          background: C.bg,
                          borderRadius: 10,
                          padding: '10px 4px',
                          outline: 'none',
                          color: C.ink,
                        }}
                      />
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        style={{
                          flex: 1,
                          fontSize: 15,
                          border: `1px solid ${C.border}`,
                          background: C.bg,
                          borderRadius: 10,
                          padding: '10px 14px',
                          outline: 'none',
                          color: C.ink,
                          fontWeight: 700,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        paddingTop: 12,
                        borderTop: `1px solid ${C.borderSoft}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: C.inkMuted,
                          fontWeight: 700,
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                          marginBottom: 8,
                        }}
                      >
                        Fréquence
                      </div>
                      <ScheduleEditor schedule={editSchedule} onChange={setEditSchedule} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        onClick={cancelEdit}
                        style={{
                          background: 'transparent',
                          color: C.inkSoft,
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          padding: '6px 14px',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Annuler
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={!editName.trim()}
                        style={{
                          background: editName.trim() ? C.sage : C.borderSoft,
                          color: editName.trim() ? '#fff' : C.inkMuted,
                          border: 'none',
                          borderRadius: 8,
                          padding: '6px 14px',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: editName.trim() ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Enregistrer
                      </button>
                    </div>
                  </div>
                ) : (
                  // ----- Normal mode -----
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {h.emoji && <span style={{ fontSize: 18 }}>{h.emoji}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, color: C.ink, fontWeight: 700 }}>{h.name}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.inkMuted,
                          fontWeight: 700,
                          marginTop: 2,
                          letterSpacing: 0.3,
                        }}
                      >
                        {scheduleLabel(h)}
                      </div>
                    </div>
                    {confirmingId === h.id ? (
                      <button
                        onClick={() => {
                          onDelete(h.id);
                          setConfirmingId(null);
                        }}
                        style={{
                          background: '#E85A4F',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '6px 10px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          animation: 'pop 0.2s ease',
                        }}
                      >
                        <Trash2 size={13} /> Confirmer
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(h)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 6,
                            borderRadius: 8,
                            color: C.inkMuted,
                            display: 'flex',
                          }}
                          aria-label="Modifier"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setConfirmingId(h.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 6,
                            borderRadius: 8,
                            color: C.inkMuted,
                            display: 'flex',
                          }}
                          aria-label="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================================
// BADGES VIEW
// ============================================================
function BadgesView({ habits, completions, unlockedBadges }) {
  const { palette: C } = useTheme();
  const unlockedCount = Object.keys(unlockedBadges).length;
  const totalCount = BADGES.length;
  const pct = totalCount ? unlockedCount / totalCount : 0;

  const stats = computeGlobalStats(habits, completions);

  // Group badges by category, ordered
  const grouped = {};
  for (const b of BADGES) {
    if (!grouped[b.category]) grouped[b.category] = [];
    grouped[b.category].push(b);
  }
  const orderedCategories = Object.keys(grouped).sort(
    (a, b) => (BADGE_CATEGORIES[a]?.order || 99) - (BADGE_CATEGORIES[b]?.order || 99),
  );

  return (
    <div className="fade-in" style={{ padding: `${S.xxxl}px ${S.xl}px ${S.xl}px` }}>
      {/* === DASHBOARD HEADER === */}
      <div
        style={{
          fontSize: 12,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: C.inkMuted,
          fontWeight: 700,
        }}
      >
        Mon parcours
      </div>
      <div
        className="display"
        style={{ marginTop: 8, fontSize: 32, color: C.ink, lineHeight: 1.1 }}
      >
        Vue d'ensemble
      </div>

      {/* Stats grid 2x2 */}
      <div
        style={{
          marginTop: S.xl,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
        }}
      >
        <StatCard
          label="Streak global"
          value={stats.globalStreak}
          suffix={stats.globalStreak > 1 ? 'jours' : 'jour'}
          accent={C.flame}
          icon={<Flame size={14} fill={C.flame} strokeWidth={0} />}
          hint="Au moins 1 habitude / jour"
        />
        <StatCard
          label="Jours d'app"
          value={stats.appDays}
          suffix={stats.appDays > 1 ? 'jours' : 'jour'}
          accent={C.ink}
        />
        <StatCard
          label="Total cochages"
          value={stats.totalCompletions}
          suffix=""
          accent={C.sage}
        />
        <StatCard
          label="Moyenne 30j"
          value={Math.round(stats.avg30 * 100)}
          suffix="%"
          accent={C.sage}
        />
      </div>

      {/* 30-day mini chart */}
      {stats.dailyActivity.some((d) => d.rate !== null) && (
        <div style={{ marginTop: S.xl }}>
          <div
            style={{
              fontSize: 12,
              color: C.inkMuted,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: S.sm,
            }}
          >
            Activité 30 jours
          </div>
          <div
            style={{
              background: C.surface,
              borderRadius: R.lg,
              padding: S.lg,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 3,
              height: 80,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            }}
          >
            {stats.dailyActivity.map((d, i) => {
              const isRest = d.rate === null;
              const h = isRest ? 0 : Math.max(d.rate * 100, d.done > 0 ? 8 : 4);
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${h}%`,
                      background: isRest
                        ? 'transparent'
                        : d.rate === 0
                        ? C.surfaceAlt
                        : `linear-gradient(180deg, ${C.sageDeep}, ${C.sage})`,
                      borderRadius: 3,
                      minHeight: isRest ? 0 : 2,
                      transition: `height 0.4s ${EASE}`,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 6,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: C.inkMuted,
              fontWeight: 700,
            }}
          >
            <span>Il y a 30 jours</span>
            <span>Aujourd'hui</span>
          </div>
        </div>
      )}

      {/* Best & worst habits */}
      {(stats.bestHabit || stats.worstHabit) && (
        <div style={{ marginTop: S.xl, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stats.bestHabit && (
            <HabitHighlight
              habit={stats.bestHabit.habit}
              rate={stats.bestHabit.rate}
              label="Habitude la plus suivie"
              accent={C.sage}
            />
          )}
          {stats.worstHabit && (
            <HabitHighlight
              habit={stats.worstHabit.habit}
              rate={stats.worstHabit.rate}
              label="Mérite plus d'attention"
              accent={C.flame}
            />
          )}
        </div>
      )}

      {/* === BADGES SECTION === */}
      <div style={{ marginTop: S.xxxl }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: C.inkMuted,
            fontWeight: 700,
          }}
        >
          Récompenses
        </div>
        <div
          className="display"
          style={{ marginTop: 8, fontSize: 32, color: C.ink, lineHeight: 1.1 }}
        >
          Mes badges
        </div>

        <div style={{ marginTop: S.lg, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="display" style={{ fontSize: 32, color: C.ink, letterSpacing: '-0.03em' }}>
            {unlockedCount}
          </span>
          <span
            className="display"
            style={{ fontSize: 18, color: C.inkMuted, fontWeight: 700 }}
          >
            / {totalCount}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 14, color: C.inkSoft, fontWeight: 700 }}>
            {Math.round(pct * 100)}%
          </span>
        </div>

        <div
          style={{
            marginTop: 12,
            height: 10,
            borderRadius: R.full,
            background: C.surface,
            overflow: 'hidden',
          }}
        >
          <div
            className="progress-fill"
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${C.sage}, ${C.sageDeep})`,
              borderRadius: R.full,
              boxShadow: pct > 0 ? `0 0 12px ${C.sage}55` : 'none',
            }}
          />
        </div>

        {/* Categories */}
        {orderedCategories.map((catId) => {
          const catLabel = BADGE_CATEGORIES[catId]?.label || catId;
          const items = grouped[catId];
          const unlockedInCat = items.filter((b) => unlockedBadges[b.id]).length;
          return (
            <div key={catId} style={{ marginTop: S.xl }}>
              <div
                style={{
                  fontSize: 12,
                  color: C.inkMuted,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: S.sm,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{catLabel}</span>
                <span style={{ color: C.inkSoft }}>
                  {unlockedInCat} / {items.length}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                }}
              >
                {items.map((b) => {
                  const unlocked = !!unlockedBadges[b.id];
                  return (
                    <div
                      key={b.id}
                      style={{
                        background: unlocked ? C.sageBg : C.surface,
                        border: 'none',
                        boxShadow: unlocked
                          ? `0 0 0 1px ${C.sage}, 0 4px 16px ${C.sage}11`
                          : '0 1px 3px rgba(0, 0, 0, 0.1)',
                        borderRadius: R.lg,
                        padding: S.lg,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        position: 'relative',
                        transition: `all 0.3s ${EASE}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 36,
                          marginBottom: 6,
                          filter: unlocked ? 'none' : 'grayscale(100%)',
                          opacity: unlocked ? 1 : 0.35,
                          transition: 'all 0.3s',
                        }}
                      >
                        {b.emoji}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: unlocked ? C.ink : C.inkSoft,
                          marginBottom: 4,
                        }}
                      >
                        {b.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.inkMuted,
                          lineHeight: 1.35,
                          fontWeight: 600,
                          minHeight: 30,
                        }}
                      >
                        {b.description}
                      </div>
                      {unlocked ? (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 10,
                            color: C.sage,
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                          }}
                        >
                          ✓ Débloqué
                        </div>
                      ) : (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 10,
                            color: C.inkMuted,
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Lock size={10} strokeWidth={2.5} />
                          Verrouillé
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HabitHighlight({ habit, rate, label, accent }) {
  const { palette: C } = useTheme();
  return (
    <div
      style={{
        background: C.surface,
        borderRadius: R.lg,
        padding: `${S.md}px ${S.lg}px`,
        display: 'flex',
        alignItems: 'center',
        gap: S.md,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div
        style={{
          width: 4,
          alignSelf: 'stretch',
          background: accent,
          borderRadius: 2,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: C.inkMuted,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: C.ink,
            marginTop: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {habit.emoji && <span>{habit.emoji}</span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {habit.name}
          </span>
        </div>
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: accent,
        }}
      >
        {Math.round(rate * 100)}%
      </div>
    </div>
  );
}

// ============================================================
// NOTE VIEW (journal entry for a given day)
// ============================================================
function NoteView({ dateKey: dateK, note, onChange, onBack }) {
  const { palette: C } = useTheme();
  const [text, setText] = useState(note || '');
  const textareaRef = useRef(null);

  // Sync if user navigates to a different date
  useEffect(() => {
    setText(note || '');
  }, [dateK, note]);

  // Auto-save : whenever text changes, persist after a short debounce
  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== (note || '')) onChange(dateK, text);
    }, 400);
    return () => clearTimeout(t);
  }, [text]);

  // Auto-focus on first open
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  const dateObj = new Date(dateK);
  const isToday = dateK === todayKey();
  const dayLabel = isToday
    ? "Aujourd'hui"
    : dateObj.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: dateObj.getFullYear() === today().getFullYear() ? undefined : 'numeric',
      });

  // Save immediately on back
  const handleBack = () => {
    if (text !== (note || '')) onChange(dateK, text);
    onBack();
  };

  return (
    <div className="fade-in" style={{ padding: `${S.lg}px ${S.xl}px ${S.xl}px`, display: 'flex', flexDirection: 'column', minHeight: '85vh' }}>
      <button
        onClick={handleBack}
        style={{
          background: C.surface,
          border: 'none',
          borderRadius: R.full,
          padding: '8px 16px 8px 10px',
          color: C.ink,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          fontWeight: 700,
          alignSelf: 'flex-start',
        }}
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
        Retour
      </button>

      <div
        style={{
          marginTop: S.xl,
          fontSize: 12,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: C.inkMuted,
          fontWeight: 700,
        }}
      >
        Note du jour
      </div>
      <div
        className="display"
        style={{
          marginTop: 4,
          fontSize: 28,
          color: C.ink,
          lineHeight: 1.15,
          textTransform: 'capitalize',
        }}
      >
        {dayLabel}
      </div>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Comment s'est passée cette journée ? Tes pensées, un mot, une intention..."
        style={{
          marginTop: S.xl,
          flex: 1,
          minHeight: 240,
          width: '100%',
          background: C.surface,
          border: 'none',
          borderRadius: R.xl,
          padding: S.lg,
          fontSize: 16,
          fontWeight: 500,
          lineHeight: 1.55,
          color: C.ink,
          outline: 'none',
          resize: 'none',
          fontFamily: 'inherit',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      />

      <div
        style={{
          marginTop: S.sm,
          fontSize: 11,
          color: C.inkMuted,
          fontWeight: 600,
          textAlign: 'right',
        }}
      >
        {text.length > 0
          ? `${text.length} caractère${text.length > 1 ? 's' : ''} · sauvegarde automatique`
          : 'sauvegarde automatique'}
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS VIEW
// ============================================================
const APP_NAME = 'À trouver';
const APP_VERSION = '1.0.0';

function SettingsView({ themeMode, setThemeMode, onBack, habits, completions, unlockedBadges, notes, onImport }) {
  const { palette: C } = useTheme();
  const [page, setPage] = useState('main'); // 'main' | 'cgu' | 'privacy' | 'contact'
  const [importStatus, setImportStatus] = useState(null); // null | 'success' | 'error' | 'preview'
  const [importPreview, setImportPreview] = useState(null);
  const fileInputRef = useRef(null);

  const themeOptions = [
    { id: 'auto', label: 'Auto', Icon: Smartphone, sub: 'Suit le système' },
    { id: 'light', label: 'Clair', Icon: Sun, sub: 'Toujours clair' },
    { id: 'dark', label: 'Sombre', Icon: Moon, sub: 'Toujours sombre' },
  ];

  // ---- Export ----
  const handleExport = () => {
    const data = {
      app: APP_NAME,
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      habits,
      completions,
      unlockedBadges,
      notes: notes || {},
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `mes-habitudes-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ---- Import ----
  const handleImportClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        // Basic validation
        if (!data || typeof data !== 'object') throw new Error('format');
        if (!Array.isArray(data.habits)) throw new Error('habits');
        if (typeof data.completions !== 'object') throw new Error('completions');
        setImportPreview(data);
        setImportStatus('preview');
      } catch (err) {
        setImportStatus('error');
        setImportPreview(null);
        setTimeout(() => setImportStatus(null), 3500);
      }
    };
    reader.readAsText(file);
    // reset to allow re-importing same file
    e.target.value = '';
  };

  const confirmImport = () => {
    if (!importPreview) return;
    onImport({
      habits: importPreview.habits,
      completions: importPreview.completions || {},
      unlockedBadges: importPreview.unlockedBadges || {},
    });
    setImportStatus('success');
    setImportPreview(null);
    setTimeout(() => setImportStatus(null), 2500);
  };

  const cancelImport = () => {
    setImportStatus(null);
    setImportPreview(null);
  };

  // ---- Sub-pages (CGU, Privacy, Contact) ----
  if (page !== 'main') {
    return (
      <SettingsSubPage
        page={page}
        onBack={() => setPage('main')}
      />
    );
  }

  return (
    <div className="fade-in" style={{ padding: `${S.lg}px ${S.xl}px ${S.xl}px` }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />

      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: C.surface,
          border: 'none',
          borderRadius: R.full,
          padding: '8px 16px 8px 10px',
          color: C.ink,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          fontWeight: 700,
        }}
        aria-label="Retour"
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
        Retour
      </button>

      {/* Header */}
      <div className="display" style={{ marginTop: S.xl, fontSize: 32, color: C.ink, lineHeight: 1.1 }}>
        Paramètres
      </div>

      {/* App identity */}
      <div
        style={{
          marginTop: S.xl,
          padding: `${S.lg}px`,
          background: C.surface,
          borderRadius: R.xl,
          display: 'flex',
          alignItems: 'center',
          gap: S.md,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: R.md,
            background: `linear-gradient(135deg, ${C.sage}, ${C.sageDeep})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: `0 4px 12px ${C.sage}33`,
          }}
        >
          <Check size={24} color="#fff" strokeWidth={3} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>{APP_NAME}</div>
          <div style={{ fontSize: 12, color: C.inkMuted, fontWeight: 700, marginTop: 1 }}>
            Version {APP_VERSION}
          </div>
        </div>
      </div>

      {/* Apparence section */}
      <SectionLabel>Apparence</SectionLabel>
      <SettingsGroup>
        {themeOptions.map(({ id, label, Icon, sub }, i) => {
          const active = themeMode === id;
          return (
            <button
              key={id}
              onClick={() => setThemeMode(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: S.md,
                padding: `${S.md}px ${S.lg}px`,
                background: active ? C.sageBg : 'transparent',
                border: 'none',
                borderRadius: R.md,
                cursor: 'pointer',
                color: C.ink,
                textAlign: 'left',
                transition: `all 0.2s ${EASE}`,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: R.md,
                  background: active ? C.sage : C.surfaceAlt,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: active ? '#fff' : C.inkSoft,
                  flexShrink: 0,
                }}
              >
                <Icon size={18} strokeWidth={2.4} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{label}</div>
                <div style={{ fontSize: 12, color: C.inkMuted, fontWeight: 600, marginTop: 1 }}>
                  {sub}
                </div>
              </div>
              {active && (
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: C.sage,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={13} color="#fff" strokeWidth={3.5} />
                </div>
              )}
            </button>
          );
        })}
      </SettingsGroup>

      {/* Données section */}
      <SectionLabel>Données</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon={<Download size={18} strokeWidth={2.4} />}
          iconBg={C.surfaceAlt}
          iconColor={C.inkSoft}
          label="Exporter mes données"
          sub="Télécharger un fichier JSON de sauvegarde"
          onClick={handleExport}
          showChevron
        />
        <SettingsRow
          icon={<Upload size={18} strokeWidth={2.4} />}
          iconBg={C.surfaceAlt}
          iconColor={C.inkSoft}
          label="Importer des données"
          sub="Restaurer depuis un fichier JSON"
          onClick={handleImportClick}
          showChevron
        />
      </SettingsGroup>

      {/* Status messages */}
      {importStatus === 'error' && (
        <div
          style={{
            marginTop: S.sm,
            padding: `${S.md}px ${S.lg}px`,
            background: `${C.red}22`,
            color: C.red,
            borderRadius: R.md,
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertCircle size={16} />
          Fichier invalide ou corrompu
        </div>
      )}
      {importStatus === 'success' && (
        <div
          style={{
            marginTop: S.sm,
            padding: `${S.md}px ${S.lg}px`,
            background: C.sageBg,
            color: C.sage,
            borderRadius: R.md,
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Check size={16} strokeWidth={3} />
          Données importées avec succès
        </div>
      )}
      {importStatus === 'preview' && importPreview && (
        <div
          style={{
            marginTop: S.sm,
            padding: S.lg,
            background: C.surface,
            border: `1.5px solid ${C.flame}`,
            borderRadius: R.lg,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: S.sm }}>
            <AlertCircle size={18} color={C.flame} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
              Confirmer l'import
            </div>
          </div>
          <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 500, marginBottom: S.md }}>
            Cette action remplacera vos {habits.length} habitudes actuelles par les{' '}
            {importPreview.habits.length} du fichier. Vos données actuelles seront perdues.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={cancelImport}
              style={{
                background: 'transparent',
                color: C.inkSoft,
                border: `1px solid ${C.border}`,
                borderRadius: R.sm,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              onClick={confirmImport}
              style={{
                background: C.flame,
                color: '#fff',
                border: 'none',
                borderRadius: R.sm,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Importer et remplacer
            </button>
          </div>
        </div>
      )}

      {/* Notifications section */}
      <SectionLabel>Notifications</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon={<Bell size={18} strokeWidth={2.4} />}
          iconBg={C.surfaceAlt}
          iconColor={C.inkMuted}
          label="Rappels"
          sub="Bientôt disponible"
          disabled
          rightContent={
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.inkMuted,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Bientôt
            </span>
          }
        />
      </SettingsGroup>

      {/* Compte section */}
      <SectionLabel>Compte</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon={<Cloud size={18} strokeWidth={2.4} />}
          iconBg={C.surfaceAlt}
          iconColor={C.inkMuted}
          label="Synchronisation cloud"
          sub="Bientôt disponible"
          disabled
          rightContent={
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.inkMuted,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Bientôt
            </span>
          }
        />
      </SettingsGroup>

      {/* À propos section */}
      <SectionLabel>À propos</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon={<FileText size={18} strokeWidth={2.4} />}
          iconBg={C.surfaceAlt}
          iconColor={C.inkSoft}
          label="Conditions d'utilisation"
          onClick={() => setPage('cgu')}
          showChevron
        />
        <SettingsRow
          icon={<Shield size={18} strokeWidth={2.4} />}
          iconBg={C.surfaceAlt}
          iconColor={C.inkSoft}
          label="Politique de confidentialité"
          onClick={() => setPage('privacy')}
          showChevron
        />
        <SettingsRow
          icon={<Mail size={18} strokeWidth={2.4} />}
          iconBg={C.surfaceAlt}
          iconColor={C.inkSoft}
          label="Contact"
          onClick={() => setPage('contact')}
          showChevron
        />
      </SettingsGroup>

      <div
        style={{
          marginTop: S.xxl,
          textAlign: 'center',
          fontSize: 11,
          color: C.inkMuted,
          fontWeight: 600,
        }}
      >
        {APP_NAME} · {APP_VERSION}
      </div>
    </div>
  );
}

// ---- Reusable settings building blocks ----
function SectionLabel({ children }) {
  const { palette: C } = useTheme();
  return (
    <div
      style={{
        fontSize: 12,
        color: C.inkMuted,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginTop: S.xxl,
        marginBottom: S.sm,
        paddingLeft: S.xs,
      }}
    >
      {children}
    </div>
  );
}

function SettingsGroup({ children }) {
  const { palette: C } = useTheme();
  return (
    <div
      style={{
        background: C.surface,
        borderRadius: R.xl,
        padding: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      }}
    >
      {children}
    </div>
  );
}

function SettingsRow({ icon, iconBg, iconColor, label, sub, onClick, showChevron, rightContent, disabled }) {
  const { palette: C } = useTheme();
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S.md,
        padding: `${S.md}px ${S.lg}px`,
        background: 'transparent',
        border: 'none',
        borderRadius: R.md,
        cursor: disabled ? 'default' : 'pointer',
        color: C.ink,
        textAlign: 'left',
        opacity: disabled ? 0.55 : 1,
        transition: `all 0.2s ${EASE}`,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: R.md,
          background: iconBg,
          color: iconColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 12, color: C.inkMuted, fontWeight: 600, marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
      {rightContent}
      {showChevron && !rightContent && (
        <ChevronRight size={16} color={C.inkMuted} strokeWidth={2.5} />
      )}
    </button>
  );
}

// ---- Sub-pages (CGU, Privacy, Contact) ----
function SettingsSubPage({ page, onBack }) {
  const { palette: C } = useTheme();
  const content = {
    cgu: {
      title: "Conditions d'utilisation",
      body: `Bienvenue dans ${APP_NAME}.

En utilisant cette application, vous acceptez les présentes conditions d'utilisation.

1. Utilisation du service
${APP_NAME} est une application de suivi d'habitudes personnelles. L'application est fournie "telle quelle", sans garantie d'aucune sorte.

2. Données utilisateur
Les habitudes et données que vous saisissez sont stockées localement sur votre appareil. Aucune donnée n'est transmise à des serveurs externes dans la version actuelle de l'application.

3. Propriété intellectuelle
${APP_NAME} et son contenu sont protégés. Toute reproduction non autorisée est interdite.

4. Responsabilité
Nous ne pouvons être tenus responsables de la perte de données ou de tout préjudice résultant de l'utilisation de l'application.

5. Modifications
Ces conditions peuvent être mises à jour à tout moment. La version en vigueur est celle affichée dans l'application.

[À COMPLÉTER AVANT PUBLICATION : ce texte est un placeholder. Faites-le vérifier par un professionnel du droit ou utilisez un générateur reconnu (Iubenda, TermsFeed, etc.) avant la mise sur les stores.]`,
    },
    privacy: {
      title: 'Politique de confidentialité',
      body: `Cette politique décrit comment ${APP_NAME} traite vos données.

1. Données collectées
${APP_NAME} ne collecte aucune donnée personnelle dans la version actuelle. Toutes vos habitudes et complétions sont stockées localement sur votre appareil.

2. Stockage local
Les informations sont conservées dans le stockage de votre appareil. Elles ne sont jamais envoyées à un serveur sans votre action explicite (futur export ou synchronisation cloud).

3. Tiers
L'application n'utilise aucun service de pistage publicitaire ni d'analyse comportementale.

4. Vos droits (RGPD)
Étant donné que les données restent sur votre appareil, vous gardez un contrôle total : vous pouvez les exporter ou les supprimer à tout moment depuis l'écran Paramètres.

5. Contact
Pour toute question : [VOTRE EMAIL DE CONTACT]

[À COMPLÉTER AVANT PUBLICATION : ce texte doit être adapté à votre situation finale (notamment si vous activez la synchronisation cloud, il faudra mettre à jour cette section).]`,
    },
    contact: {
      title: 'Contact',
      body: `Vous avez une question, une suggestion ou un problème ?

[À COMPLÉTER : indiquez ici votre email de contact, par exemple :]

📧 contact@votre-domaine.com

Merci d'utiliser ${APP_NAME} !`,
    },
  }[page] || { title: '', body: '' };

  return (
    <div className="fade-in" style={{ padding: `${S.lg}px ${S.xl}px ${S.xl}px` }}>
      <button
        onClick={onBack}
        style={{
          background: C.surface,
          border: 'none',
          borderRadius: R.full,
          padding: '8px 16px 8px 10px',
          color: C.ink,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
        Paramètres
      </button>

      <div className="display" style={{ marginTop: S.xl, fontSize: 28, color: C.ink, lineHeight: 1.15 }}>
        {content.title}
      </div>

      <div
        style={{
          marginTop: S.xl,
          padding: S.lg,
          background: C.surface,
          borderRadius: R.xl,
          fontSize: 14,
          color: C.inkSoft,
          fontWeight: 500,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      >
        {content.body}
      </div>
    </div>
  );
}

// ============================================================
// BOTTOM NAV
// ============================================================
function BottomNav({ view, setView }) {
  const { palette: C } = useTheme();
  const items = [
    { id: 'today', label: 'Aujourd’hui', Icon: HomeIcon },
    { id: 'week', label: 'Semaine', Icon: CalendarIcon },
    { id: 'habits', label: 'Habitudes', Icon: ListChecks },
    { id: 'badges', label: 'Badges', Icon: Award },
  ];
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        padding: S.lg,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          background: 'rgba(28, 28, 30, 0.78)',
          backdropFilter: 'saturate(180%) blur(24px)',
          WebkitBackdropFilter: 'saturate(180%) blur(24px)',
          border: `0.5px solid rgba(255, 255, 255, 0.08)`,
          borderRadius: R.xxl,
          padding: 6,
          display: 'flex',
          gap: 4,
          pointerEvents: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
        }}
      >
        {items.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '10px 6px',
                background: active ? C.sageBg : 'transparent',
                border: 'none',
                borderRadius: R.lg,
                cursor: 'pointer',
                color: active ? C.sageDeep : C.inkMuted,
                transition: `all 0.2s ${EASE}`,
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              <span style={{ fontSize: 11, fontWeight: 700 }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
