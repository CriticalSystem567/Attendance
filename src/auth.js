import { supabase } from "./supabaseClient.js";

// Supabase Auth is email/password under the hood, but the app only
// ever shows the person a "username" field. We deterministically turn
// a username into a synthetic, non-routable email address that Supabase
// can store — the real email column is never shown anywhere in the UI.
// Because Supabase enforces unique emails, this also gives us unique
// usernames for free (a duplicate username simply fails to sign up).
const USERNAME_DOMAIN = "dayorder.local";

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
}

export function isValidUsername(username) {
  return /^[a-z0-9_.]{3,20}$/i.test(username.trim());
}

export async function signUp(username, password) {
  const clean = username.trim();
  const result = await supabase.auth.signUp({
    email: usernameToEmail(clean),
    password,
    options: { data: { username: clean } }
  });
  if (result.error && /already registered|already exists/i.test(result.error.message || "")) {
    result.error.message = "That username is taken — try another one.";
  }
  return result;
}

export async function signIn(username, password) {
  const result = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username.trim()),
    password
  });
  if (result.error && /invalid login credentials/i.test(result.error.message || "")) {
    result.error.message = "Wrong username or password.";
  }
  return result;
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return data.subscription;
}

// Reads the human-chosen username back out of the session (falls back
// to stripping the synthetic domain off the email, just in case).
export function sessionUsername(session) {
  if (!session || !session.user) return "";
  const meta = session.user.user_metadata || {};
  if (meta.username) return meta.username;
  const email = session.user.email || "";
  return email.split("@")[0] || "";
}
