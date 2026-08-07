// Ready-made class presets. Picking one from the Profile screen creates
// (or joins) a shared class pre-filled with its timetable, subjects, and
// key academic-calendar dates, instead of the student having to build the
// Day Order grid by hand. The underlying data model is the same shared
// "branch" (config + common timetable) used for hand-built classes, so
// everything else in the app — attendance marking, stats, assignments,
// the calendar — works on preset-created classes exactly the same way.

import { holidayName } from './holidays.js';

export const PRESETS = [
  {
    slug: 'mtech-vlsi-sem3-2026',
    name: 'M.Tech - VLSI - 3rd Sem',
    subjects: {
      '21ENC367': 'Characterisation of Semiconductor Materials and Devices — Dr. Elangovan Elamurugu, TP1511',
      '21NEE361': 'Reliability Engineering of IC Technology — Dr. Inamul Hussain, TP1502',
      '21ENC365': 'Reliability Engineering Technology — Various Faculty, TP1512',
      '21ECC601T': 'Case Study — faculty depends on registration number',
      '21NET611': 'Characterisation of Semiconductor Materials and Devices Lab — Dr. Elangovan Elamurugu, Immersive Nano Fabrication Lab'
    },
    // 10 real class periods — per the official timetable, Period 6
    // (12:30–13:20) is a normal class period, NOT a lunch break.
    timeSlots: [
      '08:00-08:50', '08:50-09:40', '09:45-10:35', '10:40-11:30', '11:35-12:25',
      '12:30-13:20', '13:25-14:15', '14:20-15:10', '15:15-16:00', '16:05-16:50'
    ],
    // Anchor: Monday, 3 Aug 2026 is Day Order 5.
    startDate: '2026-08-03',
    startDayOrder: 5,
    // Case Study (21ECC601T) is B1-only, per the official course sheet:
    // "Slot: B1 – E Slot. Schedule: Day Order 4: 3:10 PM – 4:00 PM,
    // Day Order 5: 8:00 AM – 9:40 AM." Day Order 4 uses an exact
    // {start,end} (doesn't line up with the standard period grid); Day
    // Order 5 lines up exactly with periods 1-2 (08:00-09:40).
    // Reliability Engineering of IC Technology (21NEE361) lab is on Day
    // Order 4, 9:45 AM – 11:30 AM, common to both batches.
    batches: ['batch1'],
    // Still waiting on the full weekly grid for the other 3 subjects
    // (which period holds which subject on each Day Order) — the
    // academic-calendar doc gave subjects, faculty and timings but not
    // the period-by-Day-Order placement for lecture (non-lab) sessions.
    dayOrderTimetable: {
      '1': { common: [] },
      '2': { common: [] },
      '3': { common: [] },
      '4': {
        common: [[{ start: '09:45', end: '11:30' }, '21NEE361(LAB)']],
        B1: [[{ start: '15:10', end: '16:00' }, '21ECC601T']]
      },
      '5': { common: [], B1: [[1, '21ECC601T'], [2, '21ECC601T']] }
    },
    // Per-roll-number faculty for subjects whose faculty isn't fixed for
    // the whole class. Keyed by subject code — carried onto every class
    // row generated for that subject (see buildPresetTimetable below),
    // and read by resolveFacultyForClass()/the "Faculty depends on
    // Register No." UI in App.jsx. One rule per line: roll (or a
    // contiguous roll range) + ":" + faculty name.
    facultyByRoll: {
      '21ECC601T':
        'RA2512008010001-010: Dr.A.Maria Jossy\n' +
        'RA2512008010011-020: Dr.R.Prithiviraj\n' +
        'RA2512008010021-030: Dr.S.Lokesh\n' +
        'RA2512008010031-042: Dr.S.Yuvaraj'
    },
    // Semester dates confirmed; no exam/CT dates given yet — add them here
    // (label starting "CT-" for a Cycle Test, or "exam"/"FT-"/"CA-") once
    // known, and they'll auto-show as exam notes on the Calendar tab.
    academicEvents: [
      { label: 'Classes begin', date: '2026-07-21' },
      { label: 'Last working day', date: '2026-11-20' }
    ]
  }
];

// Turns dayOrderTimetable (common/B1/B2 per Day Order, 1-indexed slot
// numbers) + subjects + timeSlots into the {1..5: [...]} class-list shape
// the rest of the app already understands, split across common/batch1/batch2.
export function buildPresetTimetable(preset) {
  const emptyDO = () => ({ '1': [], '2': [], '3': [], '4': [], '5': [] });
  const result = { common: emptyDO(), batch1: emptyDO(), batch2: emptyDO() };
  const scopeMap = { common: 'common', B1: 'batch1', B2: 'batch2' };

  Object.keys(preset.dayOrderTimetable).forEach(doKey => {
    const scopes = preset.dayOrderTimetable[doKey];
    Object.keys(scopes).forEach(scopeKey => {
      const target = scopeMap[scopeKey];
      if (!target) return;
      scopes[scopeKey].forEach(([slot, cell]) => {
        if (!cell) return;
        const isLab = /\(LAB\)/i.test(cell);
        const code = cell.replace(/\(LAB\)/i, '').trim();
        const name = preset.subjects[code] || code;
        // slot is normally a 1-indexed number into preset.timeSlots (the
        // standard ~50min period grid). For sessions that don't line up
        // with that grid (e.g. a lab block, or a slot with an exact time
        // from the official timetable), pass { start, end } directly instead.
        let start, end, slotKey;
        if (slot && typeof slot === 'object') {
          start = slot.start; end = slot.end; slotKey = `${start}-${end}`;
        } else {
          [start, end] = preset.timeSlots[slot - 1].split('-');
          slotKey = slot;
        }
        const facultyByRoll = (preset.facultyByRoll || {})[code];
        result[target][doKey].push({
          id: `${preset.slug}-do${doKey}-${scopeKey}-${slotKey}`,
          subject: name + (isLab ? ' (Lab)' : ''),
          start,
          end,
          isLab,
          ...(facultyByRoll ? { facultyByRoll } : {})
        });
      });
    });
  });
  return result;
}

// Steps forward from startDate, skipping weekends and public holidays, and
// returns the next `count` working days (inclusive of startDate itself).
function nextWorkingDays(startDate, count, skipDays) {
  const dates = [];
  const cur = new Date(startDate + 'T00:00:00');
  while (dates.length < count) {
    const y = cur.getFullYear(), m = String(cur.getMonth() + 1).padStart(2, '0'), d = String(cur.getDate()).padStart(2, '0');
    const ds = `${y}-${m}-${d}`;
    if (!skipDays.includes(cur.getDay()) && !holidayName(ds)) dates.push(ds);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// "CT-" events become a continuous run of exam-day overrides — one working
// day per subject (a Cycle Test week runs one subject's exam per day), so
// with 5 subjects a CT spans 5 consecutive working days automatically.
// Everything else matching exam/CA/FT gets a single-day exam-day override.
// Note: the day-to-subject order below just follows the subjects list —
// if the real per-day CT schedule differs, adjust the generated dates in
// the Timetable screen (or provide the real order and this can be updated).
export function buildPresetOverrides(preset) {
  const overrides = {};
  const subjectNames = Object.values(preset.subjects);
  const skipDays = [0, 6];
  (preset.academicEvents || []).forEach(ev => {
    if (/^CT-/i.test(ev.label)) {
      const days = nextWorkingDays(ev.date, subjectNames.length, skipDays);
      days.forEach((d, i) => {
        overrides[d] = { type: 'exam', value: `${ev.label}: ${subjectNames[i]}` };
      });
    } else if (/exam|FT-|CA-/i.test(ev.label)) {
      if (overrides[ev.date]) overrides[ev.date].value += ` · ${ev.label}`;
      else overrides[ev.date] = { type: 'exam', value: ev.label };
    }
  });
  return overrides;
}
