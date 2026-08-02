// Class rosters used for roll-number (Register No.) auto-assignment.
// When a student enters their Register No. after signup, we look it up
// here — if it matches, they're automatically dropped into the right
// preset class (see presets.js) with their name pre-filled, instead of
// having to find and pick the class manually.
//
// Keyed by preset slug so a roster only ever auto-assigns into the class
// it belongs to. Register numbers are matched case-insensitively and with
// whitespace trimmed.

export const ROSTERS = {
  'mtech-vlsi-sem3-2026': {
    'RA2512008010001': 'Rahul R',
    'RA2512008010002': 'Asokan K',
    'RA2512008010003': 'Keerthi Kumar J',
    'RA2512008010004': 'Jarugu Venkata Madhava Sai',
    'RA2512008010005': 'Kaliveli Vishnu Vardhan',
    'RA2512008010006': 'Devisetti Vamsi Teja',
    'RA2512008010007': 'V Yashasvi Naidu',
    'RA2512008010008': 'Kunjam Yaswanth',
    'RA2512008010009': 'Damineni Shalini',
    'RA2512008010010': 'Sreenithi K M',
    'RA2512008010011': 'Ketha Yogeswar',
    'RA2512008010012': 'Kiranbabu Babu',
    'RA2512008010013': 'Sandra Elizabeth Varghese',
    'RA2512008010014': 'Shameel Ahamed M',
    'RA2512008010015': 'Papithra Selvi M',
    'RA2512008010016': 'Aayushmaan Shrivastava',
    'RA2512008010017': 'Kowdhi Lalitha',
    'RA2512008010018': 'Kundrapu Revanth Kumar',
    'RA2512008010019': 'G Yaswanth Ram',
    'RA2512008010020': 'Rosepriya Johnson',
    'RA2512008010021': 'Karan Krishnan R',
    'RA2512008010022': 'Joselit S Thayil',
    'RA2512008010023': 'Gayathri Choudhary B',
    'RA2512008010024': 'Deepika D N',
    'RA2512008010025': 'Shaik Tabasum',
    'RA2512008010026': 'Jennifer Jane Manoj',
    'RA2512008010027': 'Barathvignesh S',
    'RA2512008010028': 'Suyambulakshmi V',
    'RA2512008010029': 'Joy Winston M',
    'RA2512008010030': 'Ravinuthala Venkata Sriram',
    'RA2512008010031': 'Sai Madhuri G M K',
    'RA2512008010032': 'Surakattula Chetan',
    'RA2512008010033': 'Muddana Venkata Mani Subhash',
    'RA2512008010034': 'Prabhakaran S',
    'RA2512008010035': 'S Gowri Thampy',
    'RA2512008010036': 'Srivathsan V',
    'RA2512008010037': 'Revanuri Sai Monish Kumar',
    'RA2512008010038': 'Ravesh Raaju P',
    'RA2512008010039': 'Neha Nishad P',
    'RA2512008010040': 'Ankamreddi Tharun Ravi Shankar',
    'RA2512008010041': 'Pavalesh K',
    'RA2512008010042': 'Mohana Brammanandam L'
  }
};

// Looks up a Register No. across all rosters. Returns
// { slug, name } on a match, or null.
export function lookupRollNumber(registerNo) {
  const clean = (registerNo || '').trim().toUpperCase();
  if (!clean) return null;
  for (const slug of Object.keys(ROSTERS)) {
    const roster = ROSTERS[slug];
    const key = Object.keys(roster).find(k => k.toUpperCase() === clean);
    if (key) return { slug, name: roster[key] };
  }
  return null;
}
