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
      '21ECC530J': 'Electronic Design Automation for ASIC and FPGA',
      '21ECC531J': 'Digital System Design Using HDL',
      '21ECC532T': 'Solid State Devices and Modeling',
      '21IPC501J': 'Research Methodology',
      '21ECU531T': 'Signal Processing Techniques for VLSI'
    },
    timeSlots: [
      '08:00-08:50', '08:50-09:40', '09:45-10:35', '10:40-11:30', '11:35-12:25',
      '12:30-13:20', '13:25-14:15', '14:20-15:10', '15:15-16:00', '16:05-16:50'
    ],
    startDate: '2026-07-21',
    startDayOrder: 1,
    // Two batches. Slot numbers are 1-indexed into timeSlots above.
    // "common" entries apply to everyone; "B1"/"B2" entries apply only to
    // that batch (maps onto the app's existing batch1/batch2 concept).
    batches: ['B1', 'B2'],
    dayOrderTimetable: {
      '1': {
        common: [[3, '21ECU531T']],
        B2: [[7, '21ECC531J(LAB)']]
      },
      '2': {
        B1: [[1, '21ECC530J(LAB)']],
        common: [[6, '21ECC530J'], [7, '21IPC501J(LAB)']]
      },
      '3': {
        common: [[1, '21ECC531J'], [3, '21ECC532T'], [4, '21ECC530J']],
        B1: [[7, '21ECC531J(LAB)']]
      },
      '4': {
        B2: [[2, '21ECC530J(LAB)']],
        common: [[6, '21ECC532T'], [7, '21ECC530J'], [8, '21IPC501J'], [9, '21ECC531J']]
      },
      '5': {
        common: [[1, '21IPC501J'], [2, '21ECC531J'], [3, '21ECU531T'], [4, '21ECC532T']]
      }
    },
    // Dates matching "CT-" become a continuous run of exam-day overrides —
    // one working day per subject, since a Cycle Test week runs one subject
    // per day (5 subjects here = 5 consecutive working days). Everything in
    // this list also shows up as a read-only Academic Calendar in the
    // Notifications tab.
    academicEvents: [
      { label: 'Enrollment', date: '2026-07-20' },
      { label: 'Classes start', date: '2026-07-21' },
      { label: 'CT-1 / CA-1', date: '2026-09-16' },
      { label: 'CT-2 / CA-2', date: '2026-11-10' },
      { label: 'Practical exams start', date: '2026-11-10' },
      { label: 'Last working day', date: '2026-11-20' },
      { label: 'Theory exams start', date: '2026-11-25' },
      { label: 'Next semester enrollment', date: '2027-01-06' }
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
