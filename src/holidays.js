// India public / gazetted holidays.
// Source: Central Government gazetted holiday circular for 2026
// (Ministry of Personnel, Public Grievances & Pensions), cross-checked
// against major holiday calendars. Dates for moon-sighting-dependent
// festivals (Id-ul-Fitr, Id-ul-Zuha, Muharram, Id-e-Milad) are
// tentative and may shift by a day once officially confirmed.
//
// This list intentionally covers the national/gazetted set so the
// calendar is useful everywhere in India. Add more rows for regional
// holidays (Pongal, Onam, state formation days, etc.) the same way —
// just extend the object below.

export const INDIA_HOLIDAYS = {
  "2026-01-01": "New Year's Day",
  "2026-01-14": "Pongal / Makar Sankranti",
  "2026-01-26": "Republic Day",
  "2026-03-04": "Holi",
  "2026-03-21": "Id-ul-Fitr (tentative)",
  "2026-03-26": "Rama Navami",
  "2026-03-31": "Mahavir Jayanti",
  "2026-04-03": "Good Friday",
  "2026-05-01": "Buddha Purnima",
  "2026-05-27": "Id-ul-Zuha / Bakrid (tentative)",
  "2026-06-26": "Muharram (tentative)",
  "2026-08-15": "Independence Day",
  "2026-08-26": "Id-e-Milad (tentative)",
  "2026-09-04": "Janmashtami",
  "2026-09-14": "Vinayakar Chathurthi (Tamil Nadu)",
  "2026-10-02": "Gandhi Jayanti",
  "2026-10-19": "Ayudha Poojai (Tamil Nadu)",
  "2026-10-20": "Dussehra",
  "2026-11-08": "Diwali (Deepavali)",
  "2026-11-24": "Guru Nanak Jayanti",
  "2026-12-25": "Christmas Day"
};

export function isWeekendDate(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday=0, Saturday=6
}

export function holidayName(dateStr) {
  return INDIA_HOLIDAYS[dateStr] || null;
}

// type: 'holiday' | 'weekend' | null
export function dayKind(dateStr, date) {
  if (INDIA_HOLIDAYS[dateStr]) return 'holiday';
  if (isWeekendDate(date)) return 'weekend';
  return null;
}
