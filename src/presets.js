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
    name: 'M.Tech VLSI — Sem 3 (2026-27), SRM IST Chennai',
    subjects: {
      '21ECC630T': 'Characterisation of Semiconductor Materials and Devices',
      '21ECE636T': 'Electronics Packaging, Assembly and Testing',
      '21ECE6381': 'Reliability Engineering of IC Technology',
      '21ECG601T': 'Case Study'
    },
    timeSlots: [
      '08:00-08:50', '08:50-09:40', '09:45-10:35', '10:40-11:30', '11:35-12:25',
      '12:30-13:20', '13:25-14:15', '14:20-15:10', '15:15-16:00', '16:05-16:50'
    ],
    // ASSUMPTION — please correct if wrong: kept the same start date/Day
    // Order as the previous timetable, since the official sheet only gave
    // the weekly grid, not a semester start date.
    startDate: '2026-07-21',
    startDayOrder: 1,
    // Single batch this semester — the official sheet only showed one
    // schedule (no B1/B2 split in the grid itself). The handwritten note
    // "B1 - E slot D3:3.10 to 4 and DOS: 8-9.40" on the sheet suggests a
    // possible batch-specific override for Case Study, NOT yet applied
    // here — flag when you confirm what it means and this can be added
    // as a B1-only override.
    batches: [],
    dayOrderTimetable: {
      '1': {
        common: [[6, '21ECE636T']]
      },
      '2': {
        common: [[7, '21ECE6381'], [8, '21ECE6381'], [9, '21ECE636T'], [10, '21ECE636T']]
      },
      '3': {
        common: [[2, '21ECC630T'], [3, '21ECC630T'], [6, '21ECE6381']]
      },
      '4': {
        common: [[4, '21ECC630T(LAB)'], [5, '21ECC630T(LAB)'], [9, '21ECE6381'], [10, '21ECG601T']]
      },
      '5': {
        common: [[2, '21ECG601T'], [3, '21ECG601T'], [4, '21ECC630T']]
      }
    },
    // Dates matching "CT-" become a continuous run of exam-day overrides —
    // one working day per subject, since a Cycle Test week runs one subject
    // per day (5 subjects here = 5 consecutive working days). Everything in
    // this list also shows up as a read-only Academic Calendar in the
    // Notifications tab.
    // Cleared out — these were carried over from the old (replaced)
    // timetable and haven't been confirmed against the new one. Send the
    // academic calendar / CT dates when you have them and these can be
    // filled back in.
    academicEvents: [
      { label: 'Classes start', date: '2026-07-21' }
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
      scopes[scopeKey].forEach(([slotNum, cell]) => {
        if (!cell) return;
        const isLab = /\(LAB\)/i.test(cell);
        const code = cell.replace(/\(LAB\)/i, '').trim();
        const name = preset.subjects[code] || code;
        const [start, end] = preset.timeSlots[slotNum - 1].split('-');
        result[target][doKey].push({
          id: `${preset.slug}-do${doKey}-${scopeKey}-${slotNum}`,
          subject: name + (isLab ? ' (Lab)' : ''),
          start,
          end
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
