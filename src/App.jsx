import { useEffect, useRef } from "react";
import { storageGet, storageSet, storageDelete } from "./storage.js";
import {
  signUp, signIn, signOut, getSession, onAuthStateChange, isValidUsername, isValidEmail, sessionUsername,
  requestPasswordReset, updatePassword, addRecoveryEmail, finalizeRecoveryEmail
} from "./auth.js";
import { dayKind, holidayName } from "./holidays.js";
import { PRESETS, buildPresetTimetable, buildPresetOverrides } from "./presets.js";
import { lookupRollNumber } from "./rosters.js";
import { APP_VERSION } from "./version.js";
import logoUrl from "./assets/logo.png";
import "./App.css";

export default function App() {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    (function () {
      "use strict";

      function fmt(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; }
      function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
      function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return fmt(d); }
      function todayStr() { return fmt(new Date()); }
      function humanDate(s) { return parseDate(s).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }); }
      function shortDow(s) { return parseDate(s).toLocaleDateString('en-US', { weekday: 'short' }); }
      function uid() { return 'id_' + Math.random().toString(36).slice(2, 10); }
      function slugify(s) {
        const base = String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
        return base || ('class-' + Date.now());
      }
      function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
      function cssSafe(s) { return String(s).replace(/[^a-zA-Z0-9]/g, '_'); }
      function emptyDOMap() { return { "1": [], "2": [], "3": [], "4": [], "5": [] }; }

      const STATUS_META = {
        present: { label: 'Present', ic: '✓', color: 'var(--present)' },
        absent: { label: 'Absent', ic: '✕', color: 'var(--absent)' },
        cancelled: { label: 'Cancelled', ic: '⦸', color: 'var(--cancelled)' },
        faculty_absent: { label: 'Faculty Absent', ic: '⌀', color: 'var(--faculty)' },
        od: { label: 'On Duty', ic: '★', color: 'var(--od)' }
      };
      const BATCH_META = {
        common: { label: 'Everyone', color: 'var(--accent)', bg: 'var(--accent-dim)' },
        batch1: { label: 'Batch 1', color: 'var(--violet)', bg: 'var(--violet-dim)' },
        batch2: { label: 'Batch 2', color: 'var(--pink)', bg: 'var(--pink-dim)' }
      };

      let STATE = {
        session: null,
        bootError: null,
        authMode: 'login',
        authError: '',
        authNotice: '',
        authBusy: false,
        branches: [],
        profile: null,
        config: null,
        common: null, batch1: null, batch2: null,
        sharedConfig: null, sharedCommon: null, sharedBatch1: null, sharedBatch2: null,
        hasPersonal: false,
        changeRequests: [],
        birthdays: {},
        members: {},
        savedLogins: [],
        canInstall: false,
        assignments: [],
        assignmentStatus: {},
        attendance: {},
        tab: 'today',
        viewDate: todayStr(),
        setupDoTab: '1',
        creatingBranch: false,
        newBranchDraft: '',
        calMode: 'year',
        calYear: new Date().getFullYear(),
        calMonth: new Date().getMonth(),
        rollNumberBusy: false,
        rollNumberError: '',
        emailPromptBusy: false,
        emailPromptError: '',
        emailPromptSkipped: false,
        timetablePreview: null
      };

      const bk = slug => `branch__${slug}__`;

      function hasRealEmail() {
        const email = STATE.session && STATE.session.user ? (STATE.session.user.email || '') : '';
        return !!email && !email.endsWith('@dayorder.local');
      }


      function currentUid() { return STATE.session && STATE.session.user ? STATE.session.user.id : null; }
      // A class can have multiple admins (the creator, plus anyone they
      // promote). Only an admin's edits change the timetable for everyone;
      // anyone else's edits are personal-only until an admin approves a
      // "request". `admins` is the source of truth; `createdBy` is kept
      // around just to label who originally made the class.
      function branchAdmins(b) {
        if (!b) return [];
        if (Array.isArray(b.admins) && b.admins.length) return b.admins;
        return b.createdBy ? [b.createdBy] : [];
      }
      function isAdmin() {
        const b = STATE.branches.find(x => x.slug === STATE.profile.branch);
        return branchAdmins(b).includes(currentUid());
      }
      function isUnclaimed() {
        const b = STATE.branches.find(x => x.slug === STATE.profile.branch);
        return !!b && branchAdmins(b).length === 0;
      }
      // Non-admins start out pointing at the SAME in-memory object as the
      // shared data (no personal copy exists yet). Call this before any
      // in-place edit so we clone first — otherwise mutating STATE.config
      // would also mutate STATE.sharedConfig in memory before the (correctly
      // routed) save even happens.
      function ensurePersonal() {
        if (isAdmin()) return;
        if (STATE.config === STATE.sharedConfig) STATE.config = JSON.parse(JSON.stringify(STATE.sharedConfig));
        if (STATE.common === STATE.sharedCommon) STATE.common = JSON.parse(JSON.stringify(STATE.sharedCommon));
        if (STATE.batch1 === STATE.sharedBatch1) STATE.batch1 = JSON.parse(JSON.stringify(STATE.sharedBatch1));
        if (STATE.batch2 === STATE.sharedBatch2) STATE.batch2 = JSON.parse(JSON.stringify(STATE.sharedBatch2));
      }

      async function loadBranches() { STATE.branches = (await storageGet('branches', true)) || []; }
      async function saveBranches() { await storageSet('branches', STATE.branches, true); }

      async function loadBranchData(slug) {
        if (!slug) {
          STATE.config = null; STATE.common = emptyDOMap(); STATE.batch1 = emptyDOMap(); STATE.batch2 = emptyDOMap(); STATE.assignments = [];
          STATE.sharedConfig = null; STATE.sharedCommon = null; STATE.sharedBatch1 = null; STATE.sharedBatch2 = null;
          STATE.hasPersonal = false; STATE.changeRequests = []; STATE.birthdays = {}; STATE.members = {};
          return;
        }
        const [config, common, batch1, batch2, assignments, pConfig, pCommon, pBatch1, pBatch2, changeRequests, birthdays, members] = await Promise.all([
          storageGet(bk(slug) + 'config', true),
          storageGet(bk(slug) + 'common', true),
          storageGet(bk(slug) + 'batch1', true),
          storageGet(bk(slug) + 'batch2', true),
          storageGet(bk(slug) + 'assignments', true),
          storageGet(bk(slug) + 'p_config', false),
          storageGet(bk(slug) + 'p_common', false),
          storageGet(bk(slug) + 'p_batch1', false),
          storageGet(bk(slug) + 'p_batch2', false),
          storageGet(bk(slug) + 'changeRequests', true),
          storageGet(bk(slug) + 'birthdays', true),
          storageGet(bk(slug) + 'members', true)
        ]);
        STATE.sharedConfig = config || { startDate: todayStr(), startDayOrder: 1, skipDays: [0, 6], overrides: {}, academicEvents: [] };
        if (!STATE.sharedConfig.academicEvents) STATE.sharedConfig.academicEvents = [];
        STATE.sharedCommon = common || emptyDOMap();
        STATE.sharedBatch1 = batch1 || emptyDOMap();
        STATE.sharedBatch2 = batch2 || emptyDOMap();
        STATE.hasPersonal = !!(pConfig || pCommon || pBatch1 || pBatch2);
        STATE.config = pConfig || STATE.sharedConfig;
        if (!STATE.config.academicEvents) STATE.config.academicEvents = STATE.sharedConfig.academicEvents;
        STATE.common = pCommon || STATE.sharedCommon;
        STATE.batch1 = pBatch1 || STATE.sharedBatch1;
        STATE.batch2 = pBatch2 || STATE.sharedBatch2;
        STATE.assignments = assignments || [];
        STATE.changeRequests = changeRequests || [];
        STATE.birthdays = birthdays || {};
        STATE.members = members || {};
      }

      // Records that the signed-in user is part of this class (so the admin
      // can see who's in it and grant permissions). Never removes anyone —
      // membership only goes away if the person explicitly deletes their data.
      async function registerMembership(slug) {
        const uidv = currentUid();
        const uname = sessionUsername(STATE.session);
        if (!uidv || !uname || !slug) return;
        const members = (await storageGet(bk(slug) + 'members', true)) || {};
        if (!members[uidv]) {
          members[uidv] = { username: uname, joinedAt: todayStr() };
          await storageSet(bk(slug) + 'members', members, true);
        }
        STATE.members = members;
      }
      // Admins write straight to the shared class data (everyone sees it).
      // Everyone else writes to a personal overlay only they see.
      async function saveConfig() {
        if (isAdmin()) { STATE.sharedConfig = STATE.config; await storageSet(bk(STATE.profile.branch) + 'config', STATE.config, true); }
        else { STATE.hasPersonal = true; await storageSet(bk(STATE.profile.branch) + 'p_config', STATE.config, false); }
      }
      async function saveCollection(key) {
        const sharedKey = 'shared' + key[0].toUpperCase() + key.slice(1);
        if (isAdmin()) { STATE[sharedKey] = STATE[key]; await storageSet(bk(STATE.profile.branch) + key, STATE[key], true); }
        else { STATE.hasPersonal = true; await storageSet(bk(STATE.profile.branch) + 'p_' + key, STATE[key], false); }
      }
      async function discardPersonalOverride() {
        const slug = STATE.profile.branch;
        await Promise.all([
          storageSet(bk(slug) + 'p_config', null, false),
          storageSet(bk(slug) + 'p_common', null, false),
          storageSet(bk(slug) + 'p_batch1', null, false),
          storageSet(bk(slug) + 'p_batch2', null, false)
        ]);
        await loadBranchData(slug);
      }
      async function saveChangeRequests() { await storageSet(bk(STATE.profile.branch) + 'changeRequests', STATE.changeRequests, true); }
      async function saveBirthdays() { await storageSet(bk(STATE.profile.branch) + 'birthdays', STATE.birthdays, true); }
      async function saveAssignments() { await storageSet(bk(STATE.profile.branch) + 'assignments', STATE.assignments, true); }
      async function saveAssignmentStatus() { await storageSet('assignmentStatus', STATE.assignmentStatus, false); }
      async function saveProfile() { await storageSet('profile', STATE.profile, false); }

      // Sets up (or joins) a class from a ready-made preset. Shared by the
      // manual "Ready-made classes" picker in Profile and the post-login
      // Register No. auto-assign flow. Only seeds the shared timetable if
      // this class hasn't been seeded before, so re-applying later (e.g. an
      // already-set-up class) never wipes anyone's edits.
      async function applyPreset(preset) {
        if (!STATE.branches.find(b => b.slug === preset.slug)) {
          STATE.branches.push({ slug: preset.slug, name: preset.name, createdBy: currentUid(), admins: [currentUid()] });
          await saveBranches();
        }
        // Must set profile.branch BEFORE loading/saving, since loadBranchData,
        // saveConfig and saveCollection all key their storage off
        // STATE.profile.branch.
        STATE.profile.branch = preset.slug;
        await loadBranchData(preset.slug);
        if (STATE.sharedConfig.seededFrom !== preset.slug) {
          STATE.config = {
            startDate: preset.startDate,
            startDayOrder: preset.startDayOrder,
            skipDays: [0, 6],
            overrides: buildPresetOverrides(preset),
            academicEvents: preset.academicEvents,
            seededFrom: preset.slug
          };
          const tt = buildPresetTimetable(preset);
          STATE.common = tt.common;
          STATE.batch1 = tt.batch1;
          STATE.batch2 = tt.batch2;
          await saveConfig();
          await saveCollection('common');
          await saveCollection('batch1');
          await saveCollection('batch2');
        }
        await saveProfile();
        await registerMembership(preset.slug);
      }

      function branchName(slug) { if (!slug) return 'No class set'; const b = STATE.branches.find(x => x.slug === slug); return b ? b.name : slug; }

      function computeDayOrder(dateStr) {
        const cfg = STATE.config;
        if (!cfg) return { type: 'unset' };
        // 'exam' overrides are a note, not a day-type override: CTs don't
        // cancel classes, they just happen before the day's normal classes
        // resume, so day-order keeps advancing normally through them.
        const directOv = cfg.overrides[dateStr];
        if (directOv && directOv.type !== 'exam') return directOv;
        const target = parseDate(dateStr);
        const start = parseDate(cfg.startDate);
        if (target < start) return { type: 'before_start' };
        let currentDO = cfg.startDayOrder;
        const cur = new Date(start);
        while (fmt(cur) !== dateStr) {
          cur.setDate(cur.getDate() + 1);
          const cds = fmt(cur);
          const ov = cfg.overrides[cds];
          if (ov && ov.type !== 'exam') { if (ov.type === 'dayorder') currentDO = ov.value; }
          else if (!cfg.skipDays.includes(cur.getDay()) && !holidayName(cds)) { currentDO = (currentDO % 5) + 1; }
        }
        if (!directOv) {
          if (cfg.skipDays.includes(target.getDay())) return { type: 'holiday', value: null, auto: true };
          const hName = holidayName(dateStr);
          if (hName) return { type: 'holiday', value: null, auto: true, reason: hName };
        }
        const result = { type: 'dayorder', value: currentDO };
        if (directOv && directOv.type === 'exam') result.examNote = directOv.value || 'CT today';
        return result;
      }

      // Is dateStr a non-working day (weekend / manual holiday / public holiday)?
      function isOffDay(dateStr) {
        const cfg = STATE.config;
        if (!cfg) return false;
        const ov = cfg.overrides[dateStr];
        if (ov) return ov.type === 'holiday';
        if (cfg.skipDays.includes(parseDate(dateStr).getDay())) return true;
        return !!holidayName(dateStr);
      }

      // Finds runs of 3+ consecutive off-days ("long weekends") within the
      // configured semester window, e.g. a Friday holiday next to a weekend.
      function getLongWeekends() {
        const cfg = STATE.config;
        if (!cfg) return [];
        const lastEvent = (cfg.academicEvents || []).map(e => e.date).sort().pop();
        const rangeEnd = lastEvent || addDays(todayStr(), 120);
        const runs = [];
        let cur = cfg.startDate;
        let runStart = null;
        while (cur <= rangeEnd) {
          if (isOffDay(cur)) {
            if (!runStart) runStart = cur;
          } else if (runStart) {
            runs.push({ start: runStart, end: addDays(cur, -1) });
            runStart = null;
          }
          cur = addDays(cur, 1);
        }
        if (runStart) runs.push({ start: runStart, end: addDays(cur, -1) });
        return runs
          .map(r => ({ ...r, days: daysBetween(r.start, r.end) + 1 }))
          .filter(r => r.days >= 3);
      }

      // Notification feed for the Today screen: upcoming CTs, long weekends,
      // and birthdays (yours + classmates'), all within the next 30 days.
      function getNotifications() {
        const items = [];
        const today = todayStr();
        (STATE.config?.academicEvents || []).forEach(ev => {
          if (ev.date < today) return;
          const days = daysBetween(today, ev.date);
          if (days > 30) return;
          items.push({ icon: '📝', label: ev.label, date: ev.date, days });
        });
        getLongWeekends().forEach(lw => {
          if (lw.start < today) return;
          const days = daysBetween(today, lw.start);
          if (days > 30) return;
          items.push({ icon: '🏖️', label: `${lw.days}-day long weekend`, date: lw.start, days });
        });
        const thisYear = new Date().getFullYear();
        Object.entries(STATE.birthdays || {}).forEach(([uname, mmdd]) => {
          if (!mmdd) return;
          let next = `${thisYear}-${mmdd}`;
          if (next < today) next = `${thisYear + 1}-${mmdd}`;
          const days = daysBetween(today, next);
          if (days > 30) return;
          const isYou = uname === sessionUsername(STATE.session);
          items.push({ icon: '🎂', label: isYou ? 'Your birthday' : `${uname}'s birthday`, date: next, days });
        });
        return items.sort((a, b) => a.days - b.days);
      }

      function getClassesForDO(doValue) {
        if (!STATE.profile.branch) return [];
        const batchKey = STATE.profile.batch;
        const list = [
          ...((STATE.common[String(doValue)]) || []),
          ...((STATE[batchKey][String(doValue)]) || [])
        ];
        return list.sort((a, b) => a.start.localeCompare(b.start));
      }

      function attKey(dateStr, classId) { return `${dateStr}__${classId}`; }
      function getStatus(dateStr, classId) { const e = STATE.attendance[attKey(dateStr, classId)]; return e ? e.status : null; }
      async function markAttendance(dateStr, cls, status) {
        const key = attKey(dateStr, cls.id);
        const previous = STATE.attendance[key];
        if (previous && previous.status === status) { delete STATE.attendance[key]; }
        else { STATE.attendance[key] = { status, subject: cls.subject, date: dateStr, classId: cls.id, start: cls.start, end: cls.end }; }
        try {
          await storageSet('attendance', STATE.attendance, false);
        } catch (err) {
          // Save failed after retries — revert so the UI doesn't claim this
          // is saved when it isn't. Better an honest "try again" than a mark
          // that quietly never made it to the server.
          if (previous) STATE.attendance[key] = previous; else delete STATE.attendance[key];
          throw err;
        }
        render();
      }

      function subjectStats(subject) {
        const entries = Object.values(STATE.attendance).filter(e => e.subject === subject);
        const counts = { present: 0, absent: 0, cancelled: 0, faculty_absent: 0, od: 0 };
        entries.forEach(e => counts[e.status] !== undefined && counts[e.status]++);
        const P = counts.present, A = counts.absent, O = counts.od;
        const T = P + A + O;
        const pct = T > 0 ? (P / T * 100) : null;
        let advice = null, adviceType = 'neutral';
        if (T > 0) {
          if (pct >= 80) {
            const safeSkips = Math.floor(P / 0.8 - T);
            advice = safeSkips > 0 ? `You can skip the next ${safeSkips} class${safeSkips > 1 ? 'es' : ''} and stay ≥80%.` : `You're right at the edge — skipping now drops you below 80%.`;
            adviceType = 'good';
          } else {
            const needed = Math.max(0, Math.ceil(4 * T - 5 * P));
            advice = `Attend the next ${needed} class${needed > 1 ? 'es' : ''} without missing any to reach 80%.`;
            adviceType = 'bad';
          }
        }
        return { counts, P, A, O, T, pct, advice, adviceType, entries };
      }
      function allSubjects() {
        if (!STATE.profile.branch) return [];
        const set = new Set();
        for (let d = 1; d <= 5; d++) getClassesForDO(d).forEach(c => set.add(c.subject));
        return [...set].sort();
      }

      let toastTimer;
      function toast(msg) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = msg; el.classList.add('show');
        clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
      }

      /* ================= RENDER ================= */
      function render() {
        const root = document.getElementById('root-shell');

        if (STATE.authMode === 'reset') {
          root.innerHTML = renderAuthShell();
          return;
        }

        if (!STATE.session) {
          root.innerHTML = renderAuthShell();
          return;
        }

        if (STATE.bootError) {
          root.innerHTML = `
            <div class="app" style="align-items:center;justify-content:center;text-align:center;padding:32px;">
              <div style="font-size:34px;margin-bottom:12px;">⚠️</div>
              <h3 style="margin:0 0 8px;">Couldn't load your data</h3>
              <p style="color:var(--text-dim);font-size:13px;line-height:1.5;max-width:320px;margin:0 0 18px;">${esc(STATE.bootError)}</p>
              <button class="btn" data-action="retry-boot">Try again</button>
              <button class="btn secondary" style="margin-top:8px;" data-action="logout">Log out</button>
            </div>`;
          return;
        }

        if (!hasRealEmail() && !STATE.emailPromptSkipped) {
          root.innerHTML = renderAddEmailPrompt();
          return;
        }

        if (!STATE.profile.branch && !STATE.profile.rollNumberPromptDismissed) {
          root.innerHTML = renderRollNumberPrompt();
          return;
        }

        if (STATE.timetablePreview) {
          root.innerHTML = renderTimetablePreview();
          return;
        }

        root.innerHTML = renderAppShell();
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === STATE.tab));
        const main = document.getElementById('main');
        if (STATE.tab === 'today') main.innerHTML = renderToday();
        else if (STATE.tab === 'calendar') main.innerHTML = renderCalendar();
        else if (STATE.tab === 'subjects') main.innerHTML = renderSubjects();
        else if (STATE.tab === 'setup') { main.innerHTML = renderSetup(); renderInviteQr(); }
        else if (STATE.tab === 'assignments') main.innerHTML = renderAssignments();
        else if (STATE.tab === 'notifications') main.innerHTML = renderNotifications();
        else main.innerHTML = renderProfile();
      }

      // QR generation is async (dynamically imported), so it runs as a
      // follow-up after the Setup screen's synchronous HTML is already in
      // the DOM, filling in the <canvas> once it's ready.
      async function renderInviteQr() {
        const canvas = document.getElementById('inviteQrCanvas');
        if (!canvas) return;
        const link = canvas.dataset.link;
        try {
          const QRCode = (await import('qrcode')).default;
          await QRCode.toCanvas(canvas, link, { width: 148, margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('QR generation failed', err);
        }
      }

      function renderAppShell() {
        const soon = STATE.profile && STATE.profile.branch ? (getNotifications()[0]?.days ?? 99) <= 3 : false;
        const bellIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
        return `
          <div class="app with-nav" id="app">
            <div class="topbar">
              <div class="brand" data-action="nav-tab" data-tab="today" style="cursor:pointer;">
                <div class="brand-mark"><img src="${logoUrl}" alt="" /></div>
                <div>
                  <div class="brand-name">My Attendance Tracker <span class="brand-version">v${APP_VERSION}</span></div>
                  <div class="brand-sub">${esc(branchName(STATE.profile.branch))}</div>
                </div>
              </div>
            </div>
            <main id="main"></main>
            <div class="navbar" id="navbar">
              <button class="nav-btn" data-action="nav-tab" data-tab="today"><span class="ic">◐</span><span class="lb">Today</span></button>
              <button class="nav-btn" data-action="nav-tab" data-tab="calendar"><span class="ic">▦</span><span class="lb">Calendar</span></button>
              <button class="nav-btn" data-action="nav-tab" data-tab="subjects"><span class="ic">▤</span><span class="lb">Subjects</span></button>
              <button class="nav-btn" data-action="nav-tab" data-tab="setup"><span class="ic">⚙</span><span class="lb">Timetable</span></button>
              <button class="nav-btn" data-action="nav-tab" data-tab="notifications"><span class="ic">${bellIcon}${soon ? '<span class="nav-dot"></span>' : ''}</span><span class="lb">Alerts</span></button>
              <button class="nav-btn" data-action="nav-tab" data-tab="assignments"><span class="ic">✎</span><span class="lb">Tasks</span></button>
              <button class="nav-btn" data-action="nav-tab" data-tab="profile"><span class="ic">◍</span><span class="lb">Profile</span></button>
            </div>
          </div>
          <div class="toast" id="toast"></div>
        `;
      }

      function renderRollNumberPrompt() {
        return `
          <div class="onboard-wrap">
            <div class="onboard-logo"><img src="${logoUrl}" alt="" /></div>
            <h1 class="onboard-title">Find your class</h1>
            <p class="onboard-sub">Enter your Register No. and we'll set up your timetable automatically.</p>
            <div class="field"><label>Register No.</label><input type="text" id="rollNumberInput" placeholder="e.g. RA2512008010001" autocapitalize="characters" autocorrect="off" spellcheck="false" ${STATE.rollNumberBusy ? 'disabled' : ''}></div>
            ${STATE.rollNumberError ? `<div class="note-box" style="border-color:var(--absent);color:var(--absent);">${esc(STATE.rollNumberError)}</div>` : ''}
            <button class="btn full" style="margin-top:14px;" data-action="submit-roll-number" ${STATE.rollNumberBusy ? 'disabled' : ''}>${STATE.rollNumberBusy ? 'Looking up…' : 'Find my class'}</button>
            <button class="btn secondary full" style="margin-top:10px;" data-action="skip-roll-number">Skip — I'll pick my class manually</button>
            <div class="version-tag">v${APP_VERSION}</div>
          </div>
        `;
      }

      function renderAddEmailPrompt() {
        return `
          <div class="onboard-wrap">
            <div class="onboard-logo"><img src="${logoUrl}" alt="" /></div>
            <h1 class="onboard-title">Add a recovery email</h1>
            <p class="onboard-sub">You don't have one on file yet. Without it, there's no way to reset your password if you forget it. It's never shown to classmates.</p>
            <div class="field"><label>Email</label><input type="email" id="addEmailInput" placeholder="you@example.com" autocapitalize="off" autocorrect="off" spellcheck="false" ${STATE.emailPromptBusy ? 'disabled' : ''}></div>
            ${STATE.emailPromptError ? `<div class="note-box" style="border-color:var(--absent);color:var(--absent);">${esc(STATE.emailPromptError)}</div>` : ''}
            <button class="btn full" style="margin-top:14px;" data-action="submit-add-email" ${STATE.emailPromptBusy ? 'disabled' : ''}>${STATE.emailPromptBusy ? 'Sending…' : 'Add email'}</button>
            <button class="btn secondary full" style="margin-top:10px;" data-action="skip-add-email">Skip for now</button>
            <div class="version-tag">v${APP_VERSION}</div>
          </div>
        `;
      }

      function renderTimetablePreview() {
        const p = STATE.timetablePreview;
        const doKeys = Object.keys(STATE.common || {}).sort((a, b) => Number(a) - Number(b));
        const rows = doKeys.map(doKey => {
          const list = [
            ...((STATE.common[doKey]) || []),
            ...((STATE[STATE.profile.batch] && STATE[STATE.profile.batch][doKey]) || [])
          ].sort((a, b) => a.start.localeCompare(b.start));
          const cells = list.length
            ? list.map(c => `<div class="log-row"><span>${c.start}–${c.end}</span><span style="font-weight:600;">${esc(c.subject)}</span></div>`).join('')
            : `<div style="font-size:12px;color:var(--text-dim2);">No classes.</div>`;
          return `<div class="card" style="margin-bottom:10px;"><div class="section-label" style="margin-top:0;">Day Order ${esc(doKey)}</div>${cells}</div>`;
        }).join('');
        return `
          <div class="onboard-wrap">
            <div class="onboard-logo"><img src="${logoUrl}" alt="" /></div>
            <h1 class="onboard-title">${esc(p.presetName)}</h1>
            <p class="onboard-sub">Here's the timetable we set up${p.studentName ? ` for ${esc(p.studentName)}` : ''}. Check it looks right.</p>
            ${rows}
            <button class="btn full" style="margin-top:14px;" data-action="confirm-timetable-preview">OK, looks good</button>
          </div>
        `;
      }

      function renderAuthShell() {
        if (STATE.authMode === 'forgot') {
          return `
            <div class="onboard-wrap">
              <div class="onboard-logo"><img src="${logoUrl}" alt="" /></div>
              <h1 class="onboard-title">Reset your password</h1>
              <p class="onboard-sub">Enter your username — if your account has a recovery email on file, we'll send a reset link to it.</p>
              <div class="field"><label>Username</label><input type="text" id="authUsername" placeholder="e.g. yogeswar_k" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
              ${STATE.authError ? `<div class="note-box" style="border-color:var(--absent);color:var(--absent);">${esc(STATE.authError)}</div>` : ''}
              ${STATE.authNotice ? `<div class="note-box" style="border-color:var(--present);color:var(--present);">${esc(STATE.authNotice)}</div>` : ''}
              <button class="btn full" style="margin-top:14px;" data-action="do-forgot-password" ${STATE.authBusy ? 'disabled' : ''}>${STATE.authBusy ? 'Please wait…' : 'Send reset email'}</button>
              <button class="btn secondary full" style="margin-top:10px;" data-action="back-to-login">Back to log in</button>
              <div class="version-tag">v${APP_VERSION}</div>
            </div>`;
        }

        if (STATE.authMode === 'reset') {
          return `
            <div class="onboard-wrap">
              <div class="onboard-logo"><img src="${logoUrl}" alt="" /></div>
              <h1 class="onboard-title">Set a new password</h1>
              <p class="onboard-sub">You clicked a reset link — choose a new password for your account.</p>
              <div class="field"><label>New password</label><input type="text" id="authPassword" placeholder="At least 6 characters" style="-webkit-text-security:disc;"></div>
              ${STATE.authError ? `<div class="note-box" style="border-color:var(--absent);color:var(--absent);">${esc(STATE.authError)}</div>` : ''}
              <button class="btn full" style="margin-top:14px;" data-action="do-reset-password" ${STATE.authBusy ? 'disabled' : ''}>${STATE.authBusy ? 'Please wait…' : 'Save new password'}</button>
              <div class="version-tag">v${APP_VERSION}</div>
            </div>`;
        }

        const isLogin = STATE.authMode === 'login';
        return `
          <div class="onboard-wrap">
            <div class="onboard-logo"><img src="${logoUrl}" alt="" /></div>
            <h1 class="onboard-title">My Attendance Tracker</h1>
            <p class="onboard-sub">${isLogin ? 'Log in to see your classes, attendance and assignments.' : 'Create an account to get started — your data follows you across devices.'}</p>

            <div class="field"><label>Username</label><input type="text" id="authUsername" placeholder="e.g. yogeswar_k" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
            ${!isLogin ? `<div class="field"><label>Email <span style="font-weight:400;color:var(--text-dim2);">(optional — for password recovery only, never shown to classmates)</span></label><input type="email" id="authEmail" placeholder="you@example.com (optional)" autocapitalize="off" autocorrect="off" spellcheck="false"></div>` : ''}
            <div class="field"><label>Password</label><input type="text" id="authPassword" placeholder="At least 6 characters" style="-webkit-text-security:disc;"></div>
            ${STATE.authError ? `<div class="note-box" style="border-color:var(--absent);color:var(--absent);">${esc(STATE.authError)}</div>` : ''}

            <button class="btn full" style="margin-top:14px;" data-action="${isLogin ? 'do-login' : 'do-signup'}" ${STATE.authBusy ? 'disabled' : ''}>
              ${STATE.authBusy ? 'Please wait…' : (isLogin ? 'Log in' : 'Sign up')}
            </button>
            ${isLogin ? `<button class="btn secondary full" style="margin-top:10px;" data-action="toggle-forgot-mode">Forgot password?</button>` : ''}
            <button class="btn secondary full" style="margin-top:10px;" data-action="toggle-auth-mode">
              ${isLogin ? "New here? Create an account" : 'Already have an account? Log in'}
            </button>
            <div class="version-tag">v${APP_VERSION}</div>
          </div>
        `;
      }

      function renderToday() {
        if (!STATE.profile.branch) {
          return `
            <div class="who-strip"><b>${esc(STATE.profile.name || 'You')}</b></div>
            <div class="datenav">
              <button class="datenav-btn" data-action="date-prev">‹</button>
              <div class="datenav-mid">
                <div class="datenav-day">${shortDow(STATE.viewDate)}</div>
                <div class="datenav-date">${humanDate(STATE.viewDate)}</div>
              </div>
              <button class="datenav-btn" data-action="date-next">›</button>
            </div>
            <div class="card empty">
              <div class="ic">▤</div>
              <h3>No class set up yet</h3>
              <p>Pick or create a class in Profile to see your timetable on the calendar.</p>
              <button class="btn" data-action="nav-tab" data-tab="profile">Go to Profile</button>
            </div>`;
        }

        const d = STATE.viewDate;
        const doInfo = computeDayOrder(d);
        const isToday = d === todayStr();
        let ringHtml, metaHtml, classesHtml;

        if (doInfo.type === 'dayorder') {
          const segStops = [];
          for (let i = 0; i < 5; i++) {
            const s = i * 72, ce = s + 66, ge = s + 72;
            const filled = (i + 1) <= doInfo.value;
            segStops.push(`${filled ? 'var(--accent)' : 'rgba(255,255,255,0.12)'} ${s}deg ${ce}deg`, `transparent ${ce}deg ${ge}deg`);
          }
          ringHtml = `<div class="do-ring" style="background:conic-gradient(${segStops.join(',')})"><div class="do-ring-inner"><div class="do-ring-num">${doInfo.value}</div><div class="do-ring-label">of 5</div></div></div>`;
          const classes = getClassesForDO(doInfo.value);
          const marked = classes.filter(c => getStatus(d, c.id)).length;
          const ctNote = doInfo.examNote ? `<div class="ct-note">📝 ${esc(doInfo.examNote)} today — classes run as usual afterwards.</div>` : '';
          metaHtml = `<div class="ring-meta"><div class="ring-meta-title">Day Order ${doInfo.value}</div><div class="ring-meta-sub">${classes.length} class${classes.length !== 1 ? 'es' : ''} scheduled${classes.length ? ` · ${marked}/${classes.length} marked` : ''}</div>${ctNote}</div>`;
          classesHtml = classes.length ? classes.map(c => renderClassCard(d, c)).join('') : `<div class="card empty" style="padding:26px;"><p style="margin:0;">No classes added for Day Order ${doInfo.value} yet.</p></div>`;
        } else if (doInfo.type === 'holiday') {
          ringHtml = `<div class="do-ring" style="background:var(--holiday-dim)"><div class="do-ring-inner"><div class="do-ring-num" style="font-size:20px;color:var(--holiday);">Off</div></div></div>`;
          metaHtml = `<div class="ring-meta"><div class="ring-meta-title" style="color:var(--holiday);">Holiday</div><div class="ring-meta-sub">${doInfo.reason ? esc(doInfo.reason) : (doInfo.auto ? 'Weekly off' : 'Marked as holiday')} — no classes today.</div></div>`;
          classesHtml = '';
        } else {
          ringHtml = `<div class="do-ring" style="background:rgba(255,255,255,0.08)"><div class="do-ring-inner"><div class="do-ring-num" style="font-size:16px;">—</div></div></div>`;
          metaHtml = `<div class="ring-meta"><div class="ring-meta-title">Before calendar start</div><div class="ring-meta-sub">This date is before the configured start date.</div></div>`;
          classesHtml = '';
        }

        const nextNotif = getNotifications()[0];
        const notificationsHtml = nextNotif ? `
          <div class="note-box notif-teaser" data-action="nav-tab" data-tab="notifications" style="margin-bottom:14px;cursor:pointer;">
            <span>${nextNotif.icon} <b>${esc(nextNotif.label)}</b> — ${nextNotif.days === 0 ? 'today' : nextNotif.days === 1 ? 'tomorrow' : `in ${nextNotif.days} days`}</span>
            <span class="notif-teaser-more">See all ›</span>
          </div>
        ` : '';

        const hour = new Date().getHours();
        const greeting = hour < 5 ? 'Up late,' : hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : hour < 21 ? 'Good evening,' : 'Good night,';
        const firstName = (STATE.profile.name || 'there').trim().split(' ')[0];

        return `
          <div class="greeting">Hi ${esc(firstName)} 👋 <span class="greeting-dim">${greeting}</span></div>
          <div class="who-strip">${esc(branchName(STATE.profile.branch))}<span class="dot"></span>${BATCH_META[STATE.profile.batch].label}</div>
          ${notificationsHtml}
          <div class="datenav">
            <button class="datenav-btn" data-action="date-prev">‹</button>
            <div class="datenav-mid">
              <div class="datenav-day">${shortDow(d)}</div>
              <div class="datenav-date">${humanDate(d)}</div>
              ${!isToday ? `<div class="today-jump" data-action="date-today">Jump to today</div>` : ''}
            </div>
            <button class="datenav-btn" data-action="date-next">›</button>
          </div>
          <div class="card ring-card">${ringHtml}${metaHtml}</div>
          <div class="section-label">Classes</div>
          ${classesHtml}
        `;
      }

      function renderClassCard(dateStr, cls) {
        const status = getStatus(dateStr, cls.id);
        const borderColor = status ? STATUS_META[status].color : 'var(--border)';
        const btns = Object.entries(STATUS_META).map(([key, meta]) => `
          <button class="status-btn ${status === key ? 'active' : ''}" data-action="mark" data-status="${key}"
            data-date="${dateStr}" data-classid="${cls.id}" data-subject="${esc(cls.subject)}" data-start="${cls.start}" data-end="${cls.end}">
            <span class="ic">${meta.ic}</span><span>${meta.label}</span>
          </button>`).join('');
        const stats = subjectStats(cls.subject);
        const attendanceNote = stats.T > 0 ? `
          <div class="attend-note ${stats.adviceType}">
            <b>${stats.pct.toFixed(0)}%</b> attendance in ${esc(cls.subject)} —
            ${stats.adviceType === 'good' ? "you're in good shape, this one's skippable if you need to." : "this one matters, try not to miss it."}
          </div>` : '';
        return `
          <div class="class-card" style="border-left-color:${borderColor}">
            <div class="class-top">
              <div><div class="class-subject">${esc(cls.subject)}</div><div class="class-time">${cls.start} – ${cls.end}</div></div>
              ${status ? `<div class="status-chip" style="background:${STATUS_META[status].color}22;color:${STATUS_META[status].color}">${STATUS_META[status].label}</div>` : ''}
            </div>
            ${attendanceNote}
            <div class="status-row">${btns}</div>
          </div>`;
      }

      /* ================= CALENDAR ================= */
      const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }

      function calDoBadge(dateStr) {
        if (!STATE.profile.branch || !STATE.config) return '';
        const info = computeDayOrder(dateStr);
        return info.type === 'dayorder' ? `<div class="cal-do-badge">DO${info.value}</div>` : '';
      }

      // Only renders anything if this date actually has an exam/CT override
      // (auto-generated from the academic calendar's exam dates, or added
      // manually in Setup) — ordinary days show nothing extra.
      function calExamBadge(dateStr) {
        if (!STATE.profile.branch || !STATE.config) return '';
        const info = computeDayOrder(dateStr);
        return info.examNote ? `<div class="cal-exam">${esc(info.examNote)}</div>` : '';
      }

      function renderMiniMonth(year, month) {
        const startPad = new Date(year, month, 1).getDay();
        const total = daysInMonth(year, month);
        const todayS = todayStr();
        let cells = '';
        for (let i = 0; i < startPad; i++) cells += `<div class="cal-cell empty"></div>`;
        for (let d = 1; d <= total; d++) {
          const dateObj = new Date(year, month, d);
          const dateStr = fmt(dateObj);
          const kind = dayKind(dateStr, dateObj);
          const isToday = dateStr === todayS;
          const hName = holidayName(dateStr);
          cells += `<div class="cal-cell ${kind ? 'cal-' + kind : ''} ${isToday ? 'cal-today' : ''}" data-action="cal-jump" data-date="${dateStr}"${hName ? ` title="${esc(hName)}"` : ''}>${d}</div>`;
        }
        // Always pad out to a fixed 6-row (42-cell) grid so every month card
        // renders at the same height, regardless of how many weeks it spans.
        const trail = 42 - (startPad + total);
        for (let i = 0; i < trail; i++) cells += `<div class="cal-cell empty"></div>`;
        return `
          <div class="cal-mini" data-action="cal-open-month" data-month="${month}" data-year="${year}">
            <div class="cal-mini-title">${MONTH_NAMES[month]}</div>
            <div class="cal-grid cal-grid-mini">
              <div class="cal-dow">S</div><div class="cal-dow">M</div><div class="cal-dow">T</div><div class="cal-dow">W</div><div class="cal-dow">T</div><div class="cal-dow">F</div><div class="cal-dow">S</div>
              ${cells}
            </div>
          </div>`;
      }

      function renderCalendarLegend() {
        return `
          <div class="cal-legend">
            <span class="cal-legend-item"><i class="cal-dot cal-dot-holiday"></i>Public holiday</span>
            <span class="cal-legend-item"><i class="cal-dot cal-dot-weekend"></i>Sat / Sun</span>
            <span class="cal-legend-item"><i class="cal-dot cal-dot-today"></i>Today</span>
          </div>`;
      }

      function renderCalendarYear() {
        const year = STATE.calYear;
        const months = [];
        for (let m = 0; m < 12; m++) months.push(renderMiniMonth(year, m));
        return `
          <div class="datenav">
            <button class="datenav-btn" data-action="cal-prev-year">‹</button>
            <div class="datenav-mid"><div class="datenav-day">${year}</div><div class="datenav-date">Year calendar · India holidays</div></div>
            <button class="datenav-btn" data-action="cal-next-year">›</button>
          </div>
          ${renderCalendarLegend()}
          <div class="cal-year-grid">
            ${months.join('')}
          </div>
        `;
      }

      function renderCalendarMonth() {
        const year = STATE.calYear, month = STATE.calMonth;
        const startPad = new Date(year, month, 1).getDay();
        const total = daysInMonth(year, month);
        const todayS = todayStr();
        let cells = '';
        for (let i = 0; i < startPad; i++) cells += `<div class="cal-cell-lg empty"></div>`;
        for (let d = 1; d <= total; d++) {
          const dateObj = new Date(year, month, d);
          const dateStr = fmt(dateObj);
          const kind = dayKind(dateStr, dateObj);
          const isToday = dateStr === todayS;
          const hName = holidayName(dateStr);
          cells += `
            <div class="cal-cell-lg ${kind ? 'cal-' + kind : ''} ${isToday ? 'cal-today' : ''}" data-action="cal-jump" data-date="${dateStr}">
              <div class="cal-daynum">${d}</div>
              ${hName ? `<div class="cal-hname">${esc(hName)}</div>` : ''}
              ${calExamBadge(dateStr)}
              ${calDoBadge(dateStr)}
            </div>`;
        }
        const trail = (7 - ((startPad + total) % 7)) % 7;
        for (let i = 0; i < trail; i++) cells += `<div class="cal-cell-lg empty"></div>`;
        return `
          <div class="datenav">
            <button class="datenav-btn" data-action="cal-prev-month">‹</button>
            <div class="datenav-mid"><div class="datenav-day">${MONTH_NAMES[month]}</div><div class="datenav-date">${year}</div></div>
            <button class="datenav-btn" data-action="cal-next-month">›</button>
          </div>
          <button class="btn secondary full" style="margin-bottom:14px;" data-action="cal-back-year">« Back to year view</button>
          ${renderCalendarLegend()}
          <div class="cal-grid cal-grid-lg">
            <div class="cal-dow">Sun</div><div class="cal-dow">Mon</div><div class="cal-dow">Tue</div><div class="cal-dow">Wed</div><div class="cal-dow">Thu</div><div class="cal-dow">Fri</div><div class="cal-dow">Sat</div>
            ${cells}
          </div>
        `;
      }

      function renderCalendar() {
        return STATE.calMode === 'month' ? renderCalendarMonth() : renderCalendarYear();
      }

      function renderSubjects() {
        if (!STATE.profile.branch) {
          return `<div class="card empty"><div class="ic">▤</div><h3>No class set up yet</h3><p>Pick or create a class in Profile first.</p><button class="btn" data-action="nav-tab" data-tab="profile">Go to Profile</button></div>`;
        }
        const subs = allSubjects();
        if (!subs.length) {
          return `<div class="card empty"><div class="ic">▤</div><h3>No subjects yet</h3><p>Add your class's timetable in the Timetable tab to start tracking attendance.</p><button class="btn" data-action="nav-tab" data-tab="setup">Go to Timetable</button></div>`;
        }
        let totP = 0, totT = 0;
        subs.forEach(s => { const st = subjectStats(s); totP += st.P; totT += st.T; });
        const overallPct = totT > 0 ? (totP / totT * 100) : null;
        const overallHtml = `
          <div class="card overall">
            <div class="overall-num" style="color:${overallPct === null ? 'var(--text-dim)' : (overallPct >= 80 ? 'var(--present)' : 'var(--absent)')}">${overallPct === null ? '—' : overallPct.toFixed(1) + '%'}</div>
            <div><div style="font-weight:600;font-size:13.5px;">Overall attendance</div><div class="overall-sub">across ${subs.length} subject${subs.length !== 1 ? 's' : ''} · min. required 80%</div></div>
          </div>`;
        const cards = subs.map(s => {
          const st = subjectStats(s);
          const pctDisplay = st.pct === null ? '—' : st.pct.toFixed(1) + '%';
          const pctColor = st.pct === null ? 'var(--text-dim)' : (st.pct >= 80 ? 'var(--present)' : 'var(--absent)');
          const barColor = st.pct === null ? 'var(--text-dim2)' : (st.pct >= 80 ? 'var(--present)' : 'var(--absent)');
          const barW = st.pct === null ? 0 : Math.min(100, st.pct);
          const adviceBg = st.adviceType === 'good' ? 'var(--present-dim)' : st.adviceType === 'bad' ? 'var(--absent-dim)' : 'transparent';
          const adviceColor = st.adviceType === 'good' ? 'var(--present)' : st.adviceType === 'bad' ? 'var(--absent)' : 'var(--text-dim)';
          const log = st.entries.slice().sort((a, b) => b.date.localeCompare(a.date)).map(e => `
            <div class="log-row"><span class="ld">${e.date}</span><span>${e.start}–${e.end}</span><span style="color:${STATUS_META[e.status].color};font-weight:600;">${STATUS_META[e.status].label}</span></div>`).join('') || `<div style="font-size:12px;color:var(--text-dim2);">No entries yet.</div>`;
          return `
            <div class="card subj-card">
              <div class="subj-head" data-action="subject-toggle" data-subject="${esc(s)}">
                <div class="subj-name">${esc(s)}</div><div class="subj-pct" style="color:${pctColor}">${pctDisplay}</div>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${barW}%;background:${barColor}"></div><div class="bar-threshold"></div></div>
              <div class="subj-stats">
                <span class="stat-chip">✓ ${st.counts.present} present</span>
                <span class="stat-chip">✕ ${st.counts.absent} absent</span>
                <span class="stat-chip">★ ${st.counts.od} OD</span>
                <span class="stat-chip">⦸ ${st.counts.cancelled} cancelled</span>
                <span class="stat-chip">⌀ ${st.counts.faculty_absent} fac. absent</span>
              </div>
              ${st.advice ? `<div class="subj-advice" style="background:${adviceBg};color:${adviceColor}">${st.advice}</div>` : ''}
              <div class="subj-log" id="log-${cssSafe(s)}">${log}</div>
            </div>`;
        }).join('');
        return `
          <div class="row2" style="margin-bottom:16px;">
            <button class="btn secondary full" data-action="download-report">⬇ PDF report</button>
            <button class="btn secondary full" data-action="download-raw-data">⬇ Raw data (JSON)</button>
          </div>
        ` + overallHtml + `<div class="section-label">Subjects</div>` + cards;
      }

      function hexRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }

      function downloadRawData() {
        const payload = {
          exportedAt: new Date().toISOString(),
          profile: STATE.profile,
          className: branchName(STATE.profile.branch),
          batch: BATCH_META[STATE.profile.batch]?.label,
          attendance: STATE.attendance,
          assignmentStatus: STATE.assignmentStatus
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance-data-${todayStr()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      async function downloadAttendanceReport() {
        toast('Building your report…');
        const { jsPDF } = await import('jspdf');
        const subs = allSubjects();
        const stats = subs.map(s => ({ name: s, ...subjectStats(s) }));
        let totP = 0, totA = 0, totO = 0, totC = 0, totFA = 0, totT = 0;
        stats.forEach(s => { totP += s.P; totA += s.A; totO += s.O; totC += s.counts.cancelled; totFA += s.counts.faculty_absent; totT += s.T; });
        const overallPct = totT > 0 ? (totP / totT * 100) : null;

        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 42;
        let y = 54;

        doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(20, 22, 30);
        doc.text('Attendance Report', margin, y);
        y += 20;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(90, 96, 115);
        const subLine = `${STATE.profile.name || 'Student'}  ·  ${branchName(STATE.profile.branch)}  ·  ${BATCH_META[STATE.profile.batch].label}`;
        doc.text(subLine, margin, y);
        y += 14;
        doc.text(`Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · as of ${todayStr()}`, margin, y);
        y += 26;

        // Overall summary card
        const cardH = 74;
        doc.setFillColor(247, 248, 252);
        doc.setDrawColor(228, 230, 240);
        doc.roundedRect(margin, y, pageW - margin * 2, cardH, 8, 8, 'FD');
        const overallColor = overallPct === null ? [140, 145, 165] : overallPct >= 80 ? hexRgb('#3ecf8e') : hexRgb('#f0546a');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(30); doc.setTextColor(...overallColor);
        doc.text(overallPct === null ? '—' : `${overallPct.toFixed(1)}%`, margin + 18, y + 46);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110, 115, 132);
        doc.text('Overall attendance', margin + 18, y + 60);

        const legend = [
          ['Present', totP, '#3ecf8e'], ['Absent', totA, '#f0546a'], ['OD', totO, '#f5b942'],
          ['Cancelled', totC, '#8b93a6'], ['Faculty absent', totFA, '#7c83fd']
        ];
        let lx = margin + 165;
        legend.forEach(([label, count, color]) => {
          doc.setFillColor(...hexRgb(color));
          doc.circle(lx, y + 24, 3.2, 'F');
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70, 75, 92);
          doc.text(`${label}: ${count}`, lx + 8, y + 27);
          lx += 95;
        });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70, 75, 92);
        doc.text(`Total classes marked: ${totT}  ·  Minimum required: 80%`, margin + 165, y + 52);
        y += cardH + 30;

        // Per-subject chart
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 22, 30);
        doc.text('Subject-wise breakdown', margin, y);
        y += 20;

        const barAreaX = margin + 172;
        const barMaxW = pageW - margin - barAreaX - 92;
        stats.forEach(s => {
          if (y > pageH - 60) { doc.addPage(); y = 54; }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(35, 38, 48);
          doc.text(s.name, margin, y + 4, { maxWidth: barAreaX - margin - 10 });

          doc.setFillColor(234, 235, 242);
          doc.roundedRect(barAreaX, y - 6, barMaxW, 11, 3, 3, 'F');
          if (s.pct !== null) {
            const w = Math.max(6, barMaxW * Math.min(s.pct, 100) / 100);
            doc.setFillColor(...(s.pct >= 80 ? hexRgb('#3ecf8e') : hexRgb('#f0546a')));
            doc.roundedRect(barAreaX, y - 6, w, 11, 3, 3, 'F');
          }
          doc.setFontSize(9); doc.setTextColor(70, 75, 92);
          const pctTxt = s.pct === null ? '— ' : `${s.pct.toFixed(0)}% `;
          doc.text(`${pctTxt}(${s.P}P/${s.A}A/${s.T}T)`, barAreaX + barMaxW + 8, y + 4);
          y += 24;

          if (s.advice) {
            doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5);
            doc.setTextColor(...(s.adviceType === 'good' ? hexRgb('#1f9c68') : s.adviceType === 'bad' ? hexRgb('#c73754') : [130, 135, 150]));
            doc.text(s.advice, margin, y, { maxWidth: pageW - margin * 2 });
            y += 16;
          }
          y += 4;
        });

        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(160, 164, 178);
        doc.text('Generated by My Attendance Tracker', margin, pageH - 24);

        doc.save(`attendance-report-${todayStr()}.pdf`);
      }

      function renderSetup() {
        if (!STATE.profile.branch) {
          return `<div class="card empty"><div class="ic">⚙</div><h3>No class set up yet</h3><p>Pick or create a class in Profile first.</p><button class="btn" data-action="nav-tab" data-tab="profile">Go to Profile</button></div>`;
        }
        const cfg = STATE.config;
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const skipPills = dayNames.map((n, i) => `<div class="chk-pill ${cfg.skipDays.includes(i) ? 'active' : ''}" data-action="toggle-skip" data-day="${i}">${n}</div>`).join('');
        const overridesSorted = Object.entries(cfg.overrides).sort((a, b) => a[0].localeCompare(b[0]));
        const overridesHtml = overridesSorted.length ? overridesSorted.map(([date, ov]) => `
          <div class="override-row">
            <div><div style="font-weight:600;font-size:13px;">${date}</div><div style="font-size:11px;color:var(--text-dim);">${ov.type === 'dayorder' ? 'Forced Day Order ' + ov.value : ov.type === 'exam' ? (ov.value ? esc(ov.value) : 'CT day') : 'Holiday'}</div></div>
            <button class="icon-btn" data-action="delete-override" data-date="${date}">✕</button>
          </div>`).join('') : `<div style="font-size:12px;color:var(--text-dim2);padding:4px 0 2px;">No exceptions added yet.</div>`;

        const doTab = STATE.setupDoTab;
        const doPills = ['1', '2', '3', '4', '5'].map(n => `<div class="do-tab ${doTab === n ? 'active' : ''}" data-action="set-do-tab" data-do="${n}">DO ${n}</div>`).join('');
        const rows = [
          ...STATE.common[doTab].map(c => ({ ...c, scope: 'common' })),
          ...STATE.batch1[doTab].map(c => ({ ...c, scope: 'batch1' })),
          ...STATE.batch2[doTab].map(c => ({ ...c, scope: 'batch2' }))
        ].sort((a, b) => a.start.localeCompare(b.start));
        const classRows = rows.length ? rows.map(c => `
          <div class="tt-row">
            <div class="tt-row-info">
              <div class="n">${esc(c.subject)}</div>
              <div class="t">${c.start} – ${c.end}</div>
              <span class="scope-badge" style="background:${BATCH_META[c.scope].bg};color:${BATCH_META[c.scope].color}">${BATCH_META[c.scope].label}</span>
            </div>
            <button class="icon-btn" data-action="delete-class" data-scope="${c.scope}" data-do="${doTab}" data-id="${c.id}">✕</button>
          </div>`).join('') : `<div style="font-size:12px;color:var(--text-dim2);padding:6px 0 12px;">No classes added for Day Order ${doTab} yet.</div>`;

        const pendingRequestsHtml = (isAdmin() && STATE.changeRequests.length) ? `
          <div class="section-label">Pending requests</div>
          <div class="card">
            ${STATE.changeRequests.map(r => `
              <div class="override-row" style="align-items:flex-start;">
                <div>
                  <div style="font-weight:600;font-size:13px;">${esc(r.by)}</div>
                  <div style="font-size:11.5px;color:var(--text-dim);margin-top:2px;">${esc(r.note) || 'No description given'}</div>
                </div>
                <div style="display:flex;gap:6px;">
                  <button class="icon-btn" style="color:var(--accent);" data-action="approve-request" data-id="${r.id}">✓</button>
                  <button class="icon-btn" data-action="reject-request" data-id="${r.id}">✕</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : '';

        const permissionBanner = isAdmin()
          ? `<div class="note-box" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
               <span>Editing <b>${esc(branchName(STATE.profile.branch))}</b> — you're the admin, so changes here apply to everyone.</span>
               <button class="icon-btn" data-action="rename-branch" title="Rename class">✎</button>
             </div>`
          : `<div class="note-box" style="margin-bottom:16px;">
               ${isUnclaimed() ? `This class doesn't have an admin yet, so changes` : `You're not the admin of <b>${esc(branchName(STATE.profile.branch))}</b>, so changes you make`} below are personal to you only.
               ${STATE.hasPersonal ? `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;"><button class="btn secondary" data-action="request-change">Request this for everyone</button><button class="btn secondary" data-action="discard-personal">Discard my changes</button></div>` : ''}
             </div>`;

        const inviteLink = `${window.location.origin}${window.location.pathname}?join=${STATE.profile.branch}`;
        const memberIds = Object.keys(STATE.members || {});
        const admins = branchAdmins(STATE.branches.find(x => x.slug === STATE.profile.branch));
        const inviteHtml = isAdmin() ? `
          <div class="section-label">Invite &amp; permissions</div>
          <div class="card">
            <p class="hint" style="margin-top:0;">Share this link or QR code — anyone who opens it and signs in can join <b>${esc(branchName(STATE.profile.branch))}</b> and get its timetable. Joining is optional: they can decline and keep using the app on their own personal timetable instead.</p>
            <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
              <canvas id="inviteQrCanvas" data-link="${esc(inviteLink)}" width="148" height="148" style="border-radius:10px;background:#fff;"></canvas>
              <div style="flex:1;min-width:180px;">
                <div class="hint" style="margin:0 0 8px;word-break:break-all;">${esc(inviteLink)}</div>
                <button class="btn secondary" data-action="copy-invite-link" data-link="${esc(inviteLink)}">Copy link</button>
              </div>
            </div>
            ${memberIds.length ? `
              <div style="border-top:1px solid var(--border);padding-top:12px;">
                <div class="hint" style="margin-top:0;">Members (${memberIds.length})</div>
                ${memberIds.map(uidv => {
                  const m = STATE.members[uidv];
                  const isAdminHere = admins.includes(uidv);
                  const isSelf = uidv === currentUid();
                  return `<div class="override-row">
                    <div><div style="font-weight:600;font-size:13px;">${esc(m.username)}${isSelf ? ' (you)' : ''}</div><div style="font-size:11px;color:var(--text-dim);">${isAdminHere ? 'Admin' : 'Member'} · joined ${m.joinedAt}</div></div>
                    ${isAdminHere
                      ? `<button class="btn secondary" data-action="revoke-admin" data-uid="${uidv}">Remove admin</button>`
                      : `<button class="btn secondary" data-action="grant-admin" data-uid="${uidv}">Make admin</button>`}
                  </div>`;
                }).join('')}
              </div>
            ` : ''}
          </div>
        ` : '';

        return `
          ${permissionBanner}
          ${pendingRequestsHtml}
          ${inviteHtml}

          <div class="section-label">Day Order calendar</div>
          <div class="card">
            <div class="field"><label>Start date (a day whose Day Order you know for sure)</label><input type="date" id="cfgStartDate" value="${cfg.startDate}"></div>
            <div class="row2"><div class="field"><label>Day Order on that date</label>
              <select id="cfgStartDO">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${cfg.startDayOrder == n ? 'selected' : ''}>Day Order ${n}</option>`).join('')}</select>
            </div></div>
            <div class="field"><label>Weekly off days (cycle skips these automatically)</label><div class="chk-row">${skipPills}</div></div>
            <button class="btn full" data-action="save-calendar-config">Save calendar settings</button>
          </div>

          <div class="section-label">Exceptions — holidays, CTs, long weekends</div>
          <div class="card">
            <div class="field"><label>Date</label><input type="date" id="ovDate"></div>
            <div class="field"><label>Type</label>
              <select id="ovType">
                <option value="holiday">Holiday / long weekend</option>
                <option value="exam">CT day (classes resume after)</option>
                <option value="dayorder">Force a specific Day Order</option>
              </select>
            </div>
            <div class="field" id="ovValueWrap" style="display:none;"><label>Day Order</label>
              <select id="ovValue">${[1, 2, 3, 4, 5].map(n => `<option value="${n}">Day Order ${n}</option>`).join('')}</select>
            </div>
            <div class="field" id="ovExamNoteWrap" style="display:none;"><label>CT note (optional — e.g. subject name)</label>
              <input type="text" id="ovExamNote" placeholder="e.g. CT-1: Digital System Design"></div>
            <button class="btn full secondary" data-action="add-override">Add exception</button>
            <div style="margin-top:14px;">${overridesHtml}</div>
          </div>

          <div class="section-label">Weekly timetable</div>
          <div class="card">
            <div class="do-tabs">${doPills}</div>
            ${classRows}
            <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:14px;">
              <div class="row2"><div class="field"><label>Subject</label><input type="text" id="clsSubject" placeholder="e.g. VLSI Testing"></div></div>
              <div class="row2">
                <div class="field"><label>Start time</label><input type="time" id="clsStart"></div>
                <div class="field"><label>End time</label><input type="time" id="clsEnd"></div>
              </div>
              <div class="field"><label>Applies to</label>
                <select id="clsScope">
                  <option value="common">Everyone</option>
                  <option value="batch1">Batch 1 only</option>
                  <option value="batch2">Batch 2 only</option>
                </select>
              </div>
              <button class="btn full secondary" data-action="add-class">+ Add class to Day Order ${doTab}</button>
            </div>
          </div>
        `;
      }

      function renderNotifications() {
        if (!STATE.profile.branch) {
          return `<div class="card empty"><div class="ic">🔔</div><h3>No class set up yet</h3><p>Pick or create a class in Profile first.</p><button class="btn" data-action="nav-tab" data-tab="profile">Go to Profile</button></div>`;
        }
        const cfg = STATE.config;
        const notifications = getNotifications();
        const feedHtml = notifications.length ? `
          <div class="card" style="padding:6px 4px;">
            ${notifications.map(n => `
              <div class="notif-row">
                <div class="notif-ic">${n.icon}</div>
                <div class="notif-body">
                  <div class="notif-label">${esc(n.label)}</div>
                  <div class="notif-date">${n.date}</div>
                </div>
                <div class="notif-days">${n.days === 0 ? 'Today' : n.days === 1 ? 'Tomorrow' : `${n.days} days`}</div>
              </div>
            `).join('')}
          </div>
        ` : `<div class="card empty" style="padding:26px;"><p style="margin:0;">Nothing coming up in the next 30 days.</p></div>`;

        const academicEventsHtml = (cfg.academicEvents && cfg.academicEvents.length) ? `
          <div class="section-label">Academic calendar</div>
          <div class="card">
            ${cfg.academicEvents.slice().sort((a, b) => a.date.localeCompare(b.date)).map(ev => {
              const diff = daysBetween(todayStr(), ev.date);
              const when = diff === 0 ? 'Today' : diff > 0 ? `in ${diff} day${diff > 1 ? 's' : ''}` : `${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''} ago`;
              return `<div class="override-row"><div><div style="font-weight:600;font-size:13px;">${esc(ev.label)}</div><div style="font-size:11px;color:var(--text-dim);">${ev.date}</div></div><div style="font-size:11px;color:var(--text-dim2);white-space:nowrap;">${when}</div></div>`;
            }).join('')}
          </div>
        ` : '';

        const longWeekends = getLongWeekends().filter(lw => lw.end >= todayStr());
        const longWeekendsHtml = longWeekends.length ? `
          <div class="section-label">Long weekends this semester</div>
          <div class="card">
            ${longWeekends.map(lw => `<div class="override-row"><div><div style="font-weight:600;font-size:13px;">${lw.start} → ${lw.end}</div><div style="font-size:11px;color:var(--text-dim);">${lw.days} days off in a row</div></div></div>`).join('')}
          </div>
        ` : '';

        return `
          <div class="section-label">Coming up</div>
          ${feedHtml}
          ${academicEventsHtml}
          ${longWeekendsHtml}
        `;
      }

      function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
      function getAssignmentStatus(id) { const e = STATE.assignmentStatus[id]; return e ? e.status : 'not_started'; }
      async function setAssignmentStatus(id, status) {
        STATE.assignmentStatus[id] = { status };
        await saveAssignmentStatus();
        render();
      }
      function renderAssignments() {
        if (!STATE.profile.branch) {
          return `<div class="card empty"><div class="ic">✎</div><h3>No class set up yet</h3><p>Pick or create a class in Profile first.</p><button class="btn" data-action="nav-tab" data-tab="profile">Go to Profile</button></div>`;
        }
        const subs = allSubjects();
        const list = [...STATE.assignments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const today = todayStr();

        const cards = list.length ? list.map(a => {
          const status = getAssignmentStatus(a.id);
          const diff = daysBetween(today, a.dueDate);
          let dueLabel, dueColor;
          if (status === 'submitted') { dueLabel = 'Submitted'; dueColor = 'var(--present)'; }
          else if (diff < 0) { dueLabel = `${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''} overdue`; dueColor = 'var(--absent)'; }
          else if (diff === 0) { dueLabel = 'Due today'; dueColor = 'var(--od)'; }
          else if (diff <= 3) { dueLabel = `Due in ${diff} day${diff > 1 ? 's' : ''}`; dueColor = 'var(--od)'; }
          else { dueLabel = `Due in ${diff} days`; dueColor = 'var(--text-dim)'; }

          const statusBtns = ['not_started', 'in_progress', 'submitted'].map(s => `
            <button class="astatus-btn ${status === s ? 'active' : ''}" data-action="set-astatus" data-id="${a.id}" data-status="${s}">
              ${s === 'not_started' ? 'Not started' : s === 'in_progress' ? 'In progress' : 'Submitted'}
            </button>`).join('');

          return `
            <div class="card assign-card">
              <div class="assign-top" data-action="assign-toggle" data-id="${a.id}">
                <div>
                  <div class="assign-subject">${esc(a.subject)}</div>
                  <div class="assign-title">${esc(a.title)}</div>
                </div>
                <div class="assign-due" style="background:${dueColor}22;color:${dueColor}">${dueLabel}</div>
              </div>
              <div class="assign-meta">Due ${a.dueDate}${a.assignedDate ? ` · assigned ${a.assignedDate}` : ''}</div>
              ${a.description ? `<div class="assign-desc" id="adesc-${a.id}">${esc(a.description)}</div>` : ''}
              <div class="astatus-row">${statusBtns}</div>
            </div>`;
        }).join('') : `<div class="card empty" style="padding:26px;"><p style="margin:0;">No assignments posted yet.</p></div>`;

        const subjectOptions = subs.map(s => `<option value="${esc(s)}">`).join('');

        return `
          <div class="note-box" style="margin-bottom:16px;">Assignment details are shared with <b>${esc(branchName(STATE.profile.branch))}</b>. Your submission status is private to you.</div>
          <div class="section-label">Assignments</div>
          ${cards}
          <div class="section-label">Post a new assignment</div>
          <div class="card">
            <div class="field"><label>Subject</label><input type="text" id="asgSubject" list="subjList" placeholder="e.g. Digital Systems Design using HDL"><datalist id="subjList">${subjectOptions}</datalist></div>
            <div class="field"><label>Title</label><input type="text" id="asgTitle" placeholder="e.g. Assignment 2 — FSM design"></div>
            <div class="field"><label>Description (optional)</label><textarea id="asgDesc" placeholder="What needs to be submitted, format, etc."></textarea></div>
            <div class="row2">
              <div class="field"><label>Assigned date</label><input type="date" id="asgAssigned" value="${today}"></div>
              <div class="field"><label>Due date</label><input type="date" id="asgDue"></div>
            </div>
            <button class="btn full secondary" data-action="add-assignment">+ Post assignment</button>
          </div>
        `;
      }

      function renderProfile() {
        const options = STATE.branches.map(b => `<option value="${b.slug}" ${STATE.profile.branch === b.slug ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
        const username = sessionUsername(STATE.session);
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
        const installHtml = isStandalone ? '' : isIOS ? `
          <div class="section-label">Install app</div>
          <div class="note-box" style="margin-bottom:0;">Tap the Share button <b>⬆︎</b> in Safari's toolbar, then choose <b>"Add to Home Screen"</b>.</div>
        ` : STATE.canInstall ? `
          <div class="section-label">Install app</div>
          <button class="btn full" data-action="install-app">⬇ Install on this device</button>
        ` : '';
        const currentEmail = STATE.session?.user?.email || '';
        const hasRealEmail = currentEmail && !currentEmail.endsWith('@dayorder.local');
        return `
          ${installHtml}
          <div class="section-label">Account</div>
          <div class="card">
            <div class="field"><label>Signed in as</label><input type="text" value="${esc(username)}" disabled></div>
            <button class="btn danger full" data-action="logout">Log out</button>
          </div>

          <div class="section-label">Recovery email</div>
          <div class="card">
            ${hasRealEmail
              ? `<p class="hint" style="margin-top:0;">Password reset emails go to <b>${esc(currentEmail)}</b>.</p>`
              : `<p class="hint" style="margin-top:0;">Add a recovery email so you can reset your password if you forget it — without one, there's no way to recover this account.</p>`}
            <div class="field"><label>${hasRealEmail ? 'Change email' : 'Email'}</label><input type="email" id="recoveryEmail" placeholder="you@example.com" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
            <button class="btn secondary full" data-action="save-recovery-email">${hasRealEmail ? 'Update email' : 'Add recovery email'}</button>
          </div>

          <div class="section-label">Your profile</div>
          <div class="card">
            <div class="field"><label>Name</label><input type="text" id="pfName" value="${esc(STATE.profile.name || '')}" placeholder="Your name"></div>
            <div class="field"><label>Register No. <span style="font-weight:400;color:var(--text-dim2);">(optional)</span></label><input type="text" id="pfRollNumber" value="${esc(STATE.profile.rollNumber || '')}" placeholder="e.g. RA2512008010001" autocapitalize="characters" autocorrect="off" spellcheck="false"></div>

            <div class="field"><label>Class</label>
              ${STATE.branches.length ? `<select id="pfBranch">${options}</select>` : `<div class="hint" style="margin:0;">No classes exist yet — create one below.</div>`}
            </div>

            ${!STATE.creatingBranch ? `
              <div class="field" style="margin-bottom:14px;">
                <label>Ready-made classes</label>
                <div class="preset-list">
                  ${PRESETS.map(p => `
                    <button class="preset-btn" data-action="use-preset" data-slug="${p.slug}">
                      <div class="preset-btn-name">${esc(p.name)}</div>
                      <div class="preset-btn-sub">${Object.keys(p.subjects).length} subjects · Day Order 1–5 timetable · holidays &amp; exam dates included</div>
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${STATE.creatingBranch ? `
              <div class="field">
                <label>New class name</label>
                <input type="text" id="newBranchName" placeholder="e.g. M.Tech VLSI 2026 · Sem 3" value="${esc(STATE.newBranchDraft)}">
              </div>
              <div class="row2">
                <button class="btn secondary full" data-action="create-branch">Create class</button>
                <button class="btn secondary full" data-action="cancel-create-branch">Cancel</button>
              </div>
            ` : `
              <button class="btn secondary full" data-action="start-create-branch" style="margin-bottom:14px;">+ Create a new class from scratch</button>
            `}

            <div class="field"><label>Batch</label>
              <select id="pfBatch">
                <option value="batch1" ${STATE.profile.batch === 'batch1' ? 'selected' : ''}>Batch 1</option>
                <option value="batch2" ${STATE.profile.batch === 'batch2' ? 'selected' : ''}>Batch 2</option>
              </select>
            </div>
            <div class="field"><label>Your birthday <span style="font-weight:400;color:var(--text-dim2);">(optional — shown to classmates as a reminder, year kept private)</span></label>
              <input type="date" id="pfBirthday" value="${esc(STATE.profile.birthday || '')}">
            </div>
            <button class="btn full" data-action="save-profile">Save profile</button>
          </div>

          <div class="section-label">Saved logins</div>
          <div class="card">
            <p class="hint">For your own convenience only — stored on your account, not shared with classmates, but not encrypted either. Avoid saving anything highly sensitive here.</p>
            ${STATE.savedLogins.length ? STATE.savedLogins.map(l => `
              <div class="login-row">
                <div class="login-info">
                  <div class="login-label">${esc(l.label)}</div>
                  ${l.username ? `<div class="login-sub">${esc(l.username)}</div>` : ''}
                  ${l.password ? `<div class="login-sub">Password: <span class="login-pw" data-action="toggle-login-visibility" data-pw="${esc(l.password)}">••••••••</span></div>` : ''}
                </div>
                <button class="icon-btn" data-action="delete-login" data-id="${l.id}">✕</button>
              </div>
            `).join('') : ''}
            <div style="border-top:1px solid var(--border);margin-top:${STATE.savedLogins.length ? '10px' : '0'};padding-top:14px;">
              <div class="field"><label>Name</label><input type="text" id="liLabel" placeholder="e.g. SRM Student Portal"></div>
              <div class="row2">
                <div class="field"><label>Username</label><input type="text" id="liUsername" placeholder="Optional"></div>
                <div class="field"><label>Password</label><input type="text" id="liPassword" placeholder="Optional"></div>
              </div>
              <button class="btn secondary full" data-action="add-login">Save login</button>
            </div>
          </div>

          <div class="section-label">Your data</div>
          <div class="card">
            <p class="hint" style="margin-top:0;">Your attendance and profile are private to your account, and are never deleted automatically — only you can remove them, below.</p>
            <div class="row2" style="margin-bottom:10px;">
              <button class="btn secondary full" data-action="download-report">⬇ PDF report</button>
              <button class="btn secondary full" data-action="download-raw-data">⬇ Raw data (JSON)</button>
            </div>
            <button class="btn danger full" data-action="clear-attendance" style="margin-bottom:8px;">Clear my attendance history</button>
            <button class="btn danger full" data-action="delete-my-data">Delete all my data</button>
          </div>

          <div class="version-tag" style="text-align:center;margin-top:18px;">My Attendance Tracker · v${APP_VERSION}</div>
        `;
      }

      /* ================= EVENTS ================= */
      document.addEventListener('click', async (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;

        try {

        if (action === 'retry-boot') { await bootSession(); return; }

        /* --- auth actions --- */
        if (action === 'toggle-auth-mode') { STATE.authMode = STATE.authMode === 'login' ? 'signup' : 'login'; STATE.authError = ''; STATE.authNotice = ''; render(); return; }
        if (action === 'toggle-forgot-mode') { STATE.authMode = 'forgot'; STATE.authError = ''; STATE.authNotice = ''; render(); return; }
        if (action === 'back-to-login') { STATE.authMode = 'login'; STATE.authError = ''; STATE.authNotice = ''; render(); return; }
        if (action === 'do-login' || action === 'do-signup') {
          const username = (document.getElementById('authUsername') || {}).value?.trim();
          const email = (document.getElementById('authEmail') || {}).value?.trim();
          const password = (document.getElementById('authPassword') || {}).value || '';
          if (!username || !password) { STATE.authError = 'Enter your username and password.'; render(); return; }
          if (!isValidUsername(username)) { STATE.authError = 'Username should be 3–20 letters, numbers, underscores or dots.'; render(); return; }
          if (action === 'do-signup') {
            if (email && !isValidEmail(email)) { STATE.authError = 'That doesn\'t look like a valid email — leave it blank to skip, or fix it.'; render(); return; }
            if (password.length < 6) { STATE.authError = 'Password should be at least 6 characters.'; render(); return; }
          }
          STATE.authBusy = true; STATE.authError = ''; render();
          const { error } = action === 'do-login' ? await signIn(username, password) : await signUp(username, password, email);
          STATE.authBusy = false;
          if (error) { STATE.authError = error.message; render(); return; }
          if (action === 'do-signup') { STATE.authError = 'Account created — log in with your new username.'; STATE.authMode = 'login'; render(); return; }
          return; // successful login triggers onAuthStateChange -> boot()
        }
        if (action === 'do-forgot-password') {
          const username = (document.getElementById('authUsername') || {}).value?.trim();
          if (!username) { STATE.authError = 'Enter your username.'; render(); return; }
          STATE.authBusy = true; STATE.authError = ''; STATE.authNotice = ''; render();
          const { error } = await requestPasswordReset(username);
          STATE.authBusy = false;
          if (error) { STATE.authError = error.message; render(); return; }
          STATE.authNotice = "If that account has a recovery email, we've sent a reset link to it. Check your inbox (and spam folder).";
          render();
          return;
        }
        if (action === 'do-reset-password') {
          const password = (document.getElementById('authPassword') || {}).value || '';
          if (password.length < 6) { STATE.authError = 'Password should be at least 6 characters.'; render(); return; }
          STATE.authBusy = true; STATE.authError = ''; render();
          const { error } = await updatePassword(password);
          STATE.authBusy = false;
          if (error) { STATE.authError = error.message; render(); return; }
          toast('Password updated');
          STATE.authMode = 'login';
          await bootSession();
          return;
        }
        if (action === 'logout') {
          await signOut();
          return; // onAuthStateChange handles the reset
        }

        if (!STATE.session) return;

        if (action === 'nav-tab') { STATE.tab = el.dataset.tab; render(); }
        else if (action === 'date-prev') { STATE.viewDate = addDays(STATE.viewDate, -1); render(); }
        else if (action === 'date-next') { STATE.viewDate = addDays(STATE.viewDate, 1); render(); }
        else if (action === 'date-today') { STATE.viewDate = todayStr(); render(); }

        else if (action === 'cal-prev-year') { STATE.calYear--; render(); }
        else if (action === 'cal-next-year') { STATE.calYear++; render(); }
        else if (action === 'cal-prev-month') { if (STATE.calMonth === 0) { STATE.calMonth = 11; STATE.calYear--; } else { STATE.calMonth--; } render(); }
        else if (action === 'cal-next-month') { if (STATE.calMonth === 11) { STATE.calMonth = 0; STATE.calYear++; } else { STATE.calMonth++; } render(); }
        else if (action === 'cal-open-month') { STATE.calMonth = Number(el.dataset.month); STATE.calYear = Number(el.dataset.year); STATE.calMode = 'month'; render(); }
        else if (action === 'cal-back-year') { STATE.calMode = 'year'; render(); }
        else if (action === 'cal-jump') { STATE.viewDate = el.dataset.date; STATE.tab = 'today'; render(); }

        else if (action === 'mark') {
          await markAttendance(el.dataset.date, { id: el.dataset.classid, subject: el.dataset.subject, start: el.dataset.start, end: el.dataset.end }, el.dataset.status);
        }
        else if (action === 'subject-toggle') {
          const node = document.getElementById('log-' + cssSafe(el.dataset.subject));
          if (node) node.classList.toggle('open');
        }

        else if (action === 'toggle-skip') {
          ensurePersonal();
          const day = Number(el.dataset.day);
          const idx = STATE.config.skipDays.indexOf(day);
          if (idx > -1) STATE.config.skipDays.splice(idx, 1); else STATE.config.skipDays.push(day);
          render();
        }
        else if (action === 'save-calendar-config') {
          ensurePersonal();
          const startDate = document.getElementById('cfgStartDate').value;
          if (!startDate) { toast('Pick a start date'); return; }
          STATE.config.startDate = startDate;
          STATE.config.startDayOrder = Number(document.getElementById('cfgStartDO').value);
          await saveConfig();
          toast('Calendar settings saved');
          render();
        }
        else if (action === 'add-override') {
          ensurePersonal();
          const date = document.getElementById('ovDate').value;
          const type = document.getElementById('ovType').value;
          if (!date) { toast('Pick a date'); return; }
          if (type === 'dayorder') {
            STATE.config.overrides[date] = { type: 'dayorder', value: Number(document.getElementById('ovValue').value) };
          } else if (type === 'exam') {
            const note = document.getElementById('ovExamNote').value.trim();
            STATE.config.overrides[date] = { type: 'exam', value: note || null };
          } else {
            STATE.config.overrides[date] = { type, value: null };
          }
          await saveConfig();
          toast('Exception added');
          render();
        }
        else if (action === 'delete-override') {
          ensurePersonal();
          delete STATE.config.overrides[el.dataset.date];
          await saveConfig();
          render();
        }
        else if (action === 'set-do-tab') { STATE.setupDoTab = el.dataset.do; render(); }
        else if (action === 'add-class') {
          ensurePersonal();
          const subject = document.getElementById('clsSubject').value.trim();
          const start = document.getElementById('clsStart').value;
          const end = document.getElementById('clsEnd').value;
          const scope = document.getElementById('clsScope').value;
          if (!subject || !start || !end) { toast('Fill subject, start & end time'); return; }
          if (end <= start) { toast('End time must be after start time'); return; }
          const doTab = STATE.setupDoTab;
          STATE[scope][doTab].push({ id: uid(), subject, start, end });
          await saveCollection(scope);
          document.getElementById('clsSubject').value = '';
          document.getElementById('clsStart').value = '';
          document.getElementById('clsEnd').value = '';
          toast('Class added');
          render();
        }
        else if (action === 'delete-class') {
          ensurePersonal();
          const list = STATE[el.dataset.scope][el.dataset.do];
          const idx = list.findIndex(c => c.id === el.dataset.id);
          if (idx > -1) { list.splice(idx, 1); await saveCollection(el.dataset.scope); render(); }
        }

        else if (action === 'assign-toggle') {
          const node = document.getElementById('adesc-' + el.dataset.id);
          if (node) node.classList.toggle('open');
        }
        else if (action === 'set-astatus') {
          const cur = getAssignmentStatus(el.dataset.id);
          await setAssignmentStatus(el.dataset.id, cur === el.dataset.status ? 'not_started' : el.dataset.status);
        }
        else if (action === 'add-assignment') {
          const subject = document.getElementById('asgSubject').value.trim();
          const title = document.getElementById('asgTitle').value.trim();
          const description = document.getElementById('asgDesc').value.trim();
          const assignedDate = document.getElementById('asgAssigned').value;
          const dueDate = document.getElementById('asgDue').value;
          if (!subject || !title || !dueDate) { toast('Fill subject, title & due date'); return; }
          STATE.assignments.push({ id: uid(), subject, title, description, assignedDate, dueDate });
          await saveAssignments();
          toast('Assignment posted');
          render();
        }

        else if (action === 'save-profile') {
          const name = document.getElementById('pfName').value.trim();
          const branchSelect = document.getElementById('pfBranch');
          const branch = branchSelect ? branchSelect.value : STATE.profile.branch;
          const batch = document.getElementById('pfBatch').value;
          const birthday = (document.getElementById('pfBirthday') || {}).value || '';
          const branchChanged = branch !== STATE.profile.branch;
          const rollNumber = (document.getElementById('pfRollNumber') || {}).value?.trim().toUpperCase() || '';
          STATE.profile = { ...STATE.profile, name, branch: branch || null, batch, birthday, rollNumber };
          await saveProfile();
          if (branchChanged) await loadBranchData(STATE.profile.branch);
          if (STATE.profile.branch) await registerMembership(STATE.profile.branch);
          const uname = sessionUsername(STATE.session);
          if (uname && STATE.profile.branch) {
            const mmdd = birthday ? birthday.slice(5) : '';
            if (mmdd) STATE.birthdays[uname] = mmdd; else delete STATE.birthdays[uname];
            await saveBirthdays();
          }
          toast('Profile saved');
          STATE.tab = 'today';
          render();
        }
        else if (action === 'clear-attendance') {
          if (confirm('This clears all of your marked attendance. Your class timetable is untouched. Continue?')) {
            STATE.attendance = {};
            await storageSet('attendance', STATE.attendance, false);
            toast('Attendance history cleared');
            render();
          }
        }
        else if (action === 'start-create-branch') { STATE.creatingBranch = true; STATE.newBranchDraft = ''; render(); }
        else if (action === 'cancel-create-branch') { STATE.creatingBranch = false; render(); }
        else if (action === 'create-branch') {
          const name = document.getElementById('newBranchName').value.trim();
          if (!name) { toast('Give your class a name'); return; }
          const slug = slugify(name);
          if (!STATE.branches.find(b => b.slug === slug)) {
            STATE.branches.push({ slug, name, createdBy: currentUid(), admins: [currentUid()] });
            await saveBranches();
          }
          STATE.profile.branch = slug;
          STATE.creatingBranch = false;
          await loadBranchData(slug);
          await saveProfile();
          await registerMembership(slug);
          toast('Class created');
          render();
        }
        else if (action === 'submit-roll-number') {
          const input = document.getElementById('rollNumberInput');
          const rollNumber = (input?.value || '').trim();
          if (!rollNumber) { STATE.rollNumberError = 'Enter your Register No. first.'; render(); return; }
          const match = lookupRollNumber(rollNumber);
          if (!match) {
            STATE.rollNumberError = "That Register No. wasn't found in any class list. Check it and try again, or skip and pick your class manually.";
            render();
            return;
          }
          const preset = PRESETS.find(p => p.slug === match.slug);
          if (!preset) { STATE.rollNumberError = "That class isn't available right now."; render(); return; }
          STATE.rollNumberBusy = true; STATE.rollNumberError = ''; render();
          try {
            STATE.profile.rollNumber = rollNumber.toUpperCase();
            if (!STATE.profile.name) STATE.profile.name = match.name;
            await applyPreset(preset);
            // Don't dismiss the roll-number step or drop into the home
            // screen yet — show a preview of the resulting timetable first
            // and wait for explicit confirmation.
            STATE.timetablePreview = { presetName: preset.name, studentName: match.name };
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Roll number auto-assign failed:', err);
            STATE.rollNumberError = "Couldn't set up your class — check your connection and try again.";
          } finally {
            STATE.rollNumberBusy = false;
            render();
          }
        }
        else if (action === 'confirm-timetable-preview') {
          STATE.timetablePreview = null;
          STATE.profile.rollNumberPromptDismissed = true;
          await saveProfile();
          const first = (STATE.profile.name || '').split(' ')[0];
          toast(first ? `Welcome, ${first} — all set` : 'All set');
          STATE.tab = 'today';
          render();
        }
        else if (action === 'submit-add-email') {
          const input = document.getElementById('addEmailInput');
          const email = (input?.value || '').trim();
          if (!email || !isValidEmail(email)) { STATE.emailPromptError = 'Enter a valid email.'; render(); return; }
          STATE.emailPromptBusy = true; STATE.emailPromptError = ''; render();
          const { error } = await addRecoveryEmail(email);
          STATE.emailPromptBusy = false;
          if (error) { STATE.emailPromptError = error.message || "Couldn't add that email."; render(); return; }
          STATE.emailPromptSkipped = true;
          toast("Check your inbox to confirm it");
          render();
        }
        else if (action === 'skip-add-email') {
          STATE.emailPromptSkipped = true;
          render();
        }
        else if (action === 'skip-roll-number') {
          STATE.profile.rollNumberPromptDismissed = true;
          await saveProfile();
          render();
        }
        else if (action === 'use-preset') {
          const preset = PRESETS.find(p => p.slug === el.dataset.slug);
          if (!preset) return;
          await applyPreset(preset);
          STATE.creatingBranch = false;
          toast(`${preset.name} set up`);
          STATE.tab = 'today';
          render();
        }
        else if (action === 'grant-admin') {
          if (!isAdmin()) return;
          const b = STATE.branches.find(x => x.slug === STATE.profile.branch);
          const admins = new Set(branchAdmins(b));
          admins.add(el.dataset.uid);
          b.admins = Array.from(admins);
          await saveBranches();
          toast('Admin access granted');
          render();
        }
        else if (action === 'revoke-admin') {
          if (!isAdmin()) return;
          const b = STATE.branches.find(x => x.slug === STATE.profile.branch);
          const admins = branchAdmins(b).filter(id => id !== el.dataset.uid);
          if (admins.length === 0) { toast("A class needs at least one admin — promote someone else first"); return; }
          b.admins = admins;
          await saveBranches();
          toast('Admin access removed');
          render();
        }
        else if (action === 'copy-invite-link') {
          const link = el.dataset.link;
          try {
            await navigator.clipboard.writeText(link);
            toast('Invite link copied');
          } catch {
            prompt('Copy this link:', link);
          }
        }
        else if (action === 'rename-branch') {
          if (!isAdmin() && !isUnclaimed()) { toast('Only the class admin can rename it'); return; }
          const b = STATE.branches.find(x => x.slug === STATE.profile.branch);
          const newName = prompt('Rename class to:', b.name);
          if (!newName || !newName.trim()) return;
          b.name = newName.trim();
          await saveBranches();
          toast('Class renamed');
          render();
        }
        else if (action === 'discard-personal') {
          if (!confirm('Discard your personal timetable changes and go back to the class default?')) return;
          await discardPersonalOverride();
          toast('Personal changes discarded');
          render();
        }
        else if (action === 'request-change') {
          const note = prompt('Briefly describe the change you want applied for everyone:');
          if (note === null) return;
          STATE.changeRequests.push({
            id: uid(), by: sessionUsername(STATE.session), note: note.trim(),
            snapshot: { config: STATE.config, common: STATE.common, batch1: STATE.batch1, batch2: STATE.batch2 },
            createdAt: todayStr()
          });
          await saveChangeRequests();
          toast('Request sent to the class admin');
          render();
        }
        else if (action === 'approve-request') {
          if (!isAdmin()) return;
          const reqId = el.dataset.id;
          const req = STATE.changeRequests.find(r => r.id === reqId);
          if (!req) return;
          STATE.config = req.snapshot.config;
          STATE.common = req.snapshot.common;
          STATE.batch1 = req.snapshot.batch1;
          STATE.batch2 = req.snapshot.batch2;
          await saveConfig();
          await saveCollection('common');
          await saveCollection('batch1');
          await saveCollection('batch2');
          STATE.changeRequests = STATE.changeRequests.filter(r => r.id !== reqId);
          await saveChangeRequests();
          toast('Change applied for everyone');
          render();
        }
        else if (action === 'reject-request') {
          if (!isAdmin()) return;
          STATE.changeRequests = STATE.changeRequests.filter(r => r.id !== el.dataset.id);
          await saveChangeRequests();
          toast('Request dismissed');
          render();
        }
        else if (action === 'download-report') {
          await downloadAttendanceReport();
        }
        else if (action === 'download-raw-data') {
          downloadRawData();
        }
        else if (action === 'delete-my-data') {
          const typed = prompt('This permanently deletes your profile, attendance history, assignment status, and saved logins — and cannot be undone.\n\nType DELETE to confirm:');
          if (typed !== 'DELETE') { toast('Nothing was deleted'); return; }
          const slug = STATE.profile.branch;
          const deletions = [
            storageDelete('profile', false),
            storageDelete('attendance', false),
            storageDelete('assignmentStatus', false),
            storageDelete('savedLogins', false)
          ];
          if (slug) {
            deletions.push(
              storageDelete(bk(slug) + 'p_config', false),
              storageDelete(bk(slug) + 'p_common', false),
              storageDelete(bk(slug) + 'p_batch1', false),
              storageDelete(bk(slug) + 'p_batch2', false)
            );
          }
          await Promise.all(deletions);
          toast('Your data has been deleted');
          await signOut();
        }
        else if (action === 'save-recovery-email') {
          const email = (document.getElementById('recoveryEmail') || {}).value?.trim();
          if (!email || !isValidEmail(email)) { toast('Enter a valid email'); return; }
          const { error } = await addRecoveryEmail(email);
          if (error) { toast(error.message || "Couldn't update email"); return; }
          toast("Check your inbox to confirm — it'll take effect once confirmed");
        }
        else if (action === 'install-app') {
          if (!deferredInstallPrompt) return;
          deferredInstallPrompt.prompt();
          const choice = await deferredInstallPrompt.userChoice;
          if (choice.outcome === 'accepted') toast('Installing…');
          deferredInstallPrompt = null;
          STATE.canInstall = false;
          render();
        }
        else if (action === 'add-login') {
          const label = document.getElementById('liLabel').value.trim();
          const username = document.getElementById('liUsername').value.trim();
          const password = document.getElementById('liPassword').value;
          if (!label) { toast('Give it a name, e.g. "SRM Student Portal"'); return; }
          STATE.savedLogins.push({ id: uid(), label, username, password });
          await storageSet('savedLogins', STATE.savedLogins, false);
          document.getElementById('liLabel').value = '';
          document.getElementById('liUsername').value = '';
          document.getElementById('liPassword').value = '';
          render();
        }
        else if (action === 'delete-login') {
          STATE.savedLogins = STATE.savedLogins.filter(l => l.id !== el.dataset.id);
          await storageSet('savedLogins', STATE.savedLogins, false);
          render();
        }
        else if (action === 'toggle-login-visibility') {
          const row = el.closest('.login-row');
          const pwSpan = row.querySelector('.login-pw');
          pwSpan.textContent = pwSpan.textContent === '••••••••' ? el.dataset.pw : '••••••••';
        }

        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Action failed:', action, err);
          toast("Couldn't save that — check your connection and try again");
          STATE.authBusy = false;
          render();
        }
      });

      document.addEventListener('change', (e) => {
        if (e.target.id === 'ovType') {
          document.getElementById('ovValueWrap').style.display = e.target.value === 'dayorder' ? 'block' : 'none';
          document.getElementById('ovExamNoteWrap').style.display = e.target.value === 'exam' ? 'block' : 'none';
        }
      });

      /* ---------- boot ---------- */
      async function loadEverythingForSession() {
        const [profile, attendance, assignmentStatus, savedLogins] = await Promise.all([
          storageGet('profile', false),
          storageGet('attendance', false),
          storageGet('assignmentStatus', false),
          storageGet('savedLogins', false)
        ]);
        // Safe to default to empty here: storageGet only resolves to null for
        // a genuinely-empty key, and throws (caught by the caller) on an
        // actual failure — so we never mistake "couldn't load" for "empty".
        STATE.profile = profile || { name: '', branch: null, batch: 'batch1', rollNumber: '', rollNumberPromptDismissed: false };
        STATE.attendance = attendance || {};
        STATE.assignmentStatus = assignmentStatus || {};
        STATE.savedLogins = savedLogins || [];
        await loadBranches();
        await loadBranchData(STATE.profile.branch);
        STATE.tab = 'today';
      }

      async function bootSession() {
        STATE.bootError = null;
        try {
          await loadEverythingForSession();
          await handleJoinLink();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Failed to load your data on boot:', err);
          // Deliberately don't fall back to empty defaults here — that's
          // exactly the trap that used to risk overwriting real data with a
          // blank slate. Show a retry screen and touch nothing until a load
          // actually succeeds.
          STATE.bootError = "Couldn't load your data — your saved attendance and timetable are safe, this device just couldn't reach them right now. Check your connection and try again.";
        }
        render();
      }

      // If the URL has ?join=SLUG (from an invite link/QR), offer to join
      // that class. Always optional — declining just leaves things as they
      // were. The param is stripped from the URL either way so refreshing
      // doesn't re-prompt.
      async function handleJoinLink() {
        const params = new URLSearchParams(window.location.search);
        const joinSlug = params.get('join');
        if (!joinSlug) return;
        const url = new URL(window.location.href);
        url.searchParams.delete('join');
        window.history.replaceState({}, '', url.pathname + url.search);

        const branch = STATE.branches.find(b => b.slug === joinSlug);
        if (!branch) { toast("That invite link isn't valid (anymore)"); return; }
        if (STATE.profile.branch === joinSlug) return;
        if (!confirm(`Join "${branch.name}"?\n\nYou'll get its timetable. This is optional — you can decline and keep your own personal timetable, or switch classes anytime from Profile.`)) return;
        STATE.profile.branch = joinSlug;
        await saveProfile();
        await loadBranchData(joinSlug);
        await registerMembership(joinSlug);
        toast(`Joined ${branch.name}`);
      }

      function resetLocalState() {
        STATE.profile = null; STATE.branches = []; STATE.config = null;
        STATE.common = null; STATE.batch1 = null; STATE.batch2 = null;
        STATE.assignments = []; STATE.assignmentStatus = {}; STATE.attendance = {};
        STATE.savedLogins = []; STATE.changeRequests = []; STATE.birthdays = {};
        STATE.bootError = null;
        STATE.tab = 'today'; STATE.viewDate = todayStr(); STATE.creatingBranch = false;
      }

      let deferredInstallPrompt = null;
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        STATE.canInstall = true;
        if (STATE.tab === 'profile') render();
      });
      window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        STATE.canInstall = false;
      });

      (async function init() {
        const session = await getSession();
        STATE.session = session;
        if (session) await bootSession();
        else render();

        onAuthStateChange(async (session, event) => {
          if (event === 'PASSWORD_RECOVERY') {
            // Supabase signs them into a temporary recovery session when
            // they click the emailed reset link — don't boot the normal
            // app on top of that, show the "set a new password" screen.
            STATE.session = session;
            STATE.authMode = 'reset';
            STATE.authError = '';
            render();
            return;
          }
          if (event === 'USER_UPDATED' && STATE.session && STATE.profile) {
            // Fires once they've confirmed a new/changed email address —
            // register it so future logins and password resets use it.
            const uname = sessionUsername(session);
            if (uname) await finalizeRecoveryEmail(uname);
          }
          const hadSession = !!STATE.session;
          STATE.session = session;
          if (session && !hadSession) {
            await bootSession();
          } else if (!session && hadSession) {
            resetLocalState();
            STATE.authMode = 'login';
            STATE.authError = '';
            render();
          }
        });
      })();

    })();
  }, []);

  return <div id="root-shell"></div>;
}
