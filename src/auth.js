import { supabase } from "./supabaseClient.js";

// Supabase Auth is email/password under the hood, but the app only ever
// shows the person a "username" field.
//
// Originally this deterministically turned a username into a synthetic,
// non-routable email ("username@dayorder.local") so Supabase could store
// something as the login email. That worked for login, but it means
// Supabase's real password-reset email has nowhere real to send to.
//
// Now, signup collects a real email too (used only for password recovery,
// never shown as your identity elsewhere) and records a username -> email
// mapping in the `usernames` table, so:
//   - you still only ever type a username to log in
//   - "forgot password" can look up your real email and send an actual
//     Supabase reset email to it
// Accounts created before this existed fall back to the old synthetic
// email automatically, until they add a recovery email from Profile.

const LEGACY_USERNAME_DOMAIN = "dayorder.local";

function legacyEmail(username) {
  return `${username.trim().toLowerCase()}@${LEGACY_USERNAME_DOMAIN}`;
}

export function isValidUsername(username) {
  return /^[a-z0-9_.]{3,20}$/i.test(username.trim());
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function lookupEmailForUsername(username) {
  const clean = username.trim().toLowerCase();
  const { data } = await supabase.from("usernames").select("email").eq("username", clean).maybeSingle();
  if (data && data.email) return data.email;
  return legacyEmail(clean); // pre-existing account, no real email on file yet
}

export async function signUp(username, password, email) {
  const clean = username.trim().toLowerCase();
  const { data: existing } = await supabase.from("usernames").select("username").eq("username", clean).maybeSingle();
  if (existing) return { error: { message: "That username is taken — try another one." } };

  // Always register with the synthetic address. This is what makes login
  // work immediately regardless of Supabase's "Confirm email" setting or
  // whether any mail actually gets delivered.
  const result = await supabase.auth.signUp({
    email: legacyEmail(clean),
    password,
    options: { data: { username: clean } }
  });
  if (result.error) return result;

  if (result.data.user) {
    const { error: mapError } = await supabase
      .from("usernames")
      .insert({ username: clean, user_id: result.data.user.id, email: legacyEmail(clean) });
    if (mapError) {
      // Very rare race (two people grabbed the same username at once).
      // The auth account exists but we couldn't claim the username — tell
      // them plainly rather than leaving it looking like a silent success.
      return { error: { message: "That username was just taken by someone else — try another one." } };
    }

    // Optional real email: kick off Supabase's own "confirm new email"
    // flow right away. This never blocks login — the account keeps
    // working with the synthetic address until (and unless) they click
    // the confirmation link, at which point onAuthStateChange fires and
    // finalizeRecoveryEmail() records the real address.
    const trimmedEmail = (email || "").trim();
    if (trimmedEmail) {
      await supabase.auth.updateUser({ email: trimmedEmail });
    }
  }
  return result;
}

export async function signIn(username, password) {
  const email = await lookupEmailForUsername(username);
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error && /invalid login credentials/i.test(result.error.message || "")) {
    result.error.message = "Wrong username or password.";
  }
  return result;
}

// Sends a real password-reset email, if this account has one on file.
export async function requestPasswordReset(username) {
  const email = await lookupEmailForUsername(username);
  if (email.endsWith(`@${LEGACY_USERNAME_DOMAIN}`)) {
    return { error: { message: "This account doesn't have a recovery email yet. Log in and add one from Profile, then you can use this." } };
  }
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

// Called from the "set a new password" screen after clicking the emailed
// reset link (Supabase has already signed them into a temporary recovery
// session by that point).
export async function updatePassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword });
}

// Lets an existing account (signed in) attach or change its recovery
// email. Supabase requires confirming the new address before it takes
// effect — finalizeRecoveryEmail() below records it in `usernames` once
// that confirmation completes.
export async function addRecoveryEmail(email) {
  return supabase.auth.updateUser({ email: email.trim() });
}

export async function finalizeRecoveryEmail(username) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return;
  await supabase.from("usernames").upsert({ username: username.trim().toLowerCase(), user_id: user.id, email: user.email });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => cb(session, event));
  return data.subscription;
}

// Reads the human-chosen username back out of the session (falls back
// to stripping the domain off the email, just in case).
export function sessionUsername(session) {
  if (!session || !session.user) return "";
  const meta = session.user.user_metadata || {};
  if (meta.username) return meta.username;
  const email = session.user.email || "";
  return email.split("@")[0] || "";
}
