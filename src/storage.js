import { supabase } from "./supabaseClient.js";

// Shared data (class timetables, config, assignments) lives in the
// `shared_data` table — every classmate who opens the site sees the same thing.
//
// Personal data (your profile, your attendance marks, your assignment
// status) lives in the `user_data` table, scoped to your logged-in
// account via Row Level Security — so it follows you across devices,
// but nobody else can read or write it.
//
// IMPORTANT: these functions used to swallow every error and quietly
// return null/false. That's dangerous for data like attendance history —
// a transient network hiccup (very common right after a page refresh,
// while the auth session is still restoring) would silently look like
// "you have no data yet", and a save right after that would overwrite
// real history with an empty record. So instead: retry a few times with
// backoff, and if it still fails, THROW — callers must treat a thrown
// error as "we don't actually know the state", not "there's no data".

const RETRY_COUNT = 4;
const RETRY_BASE_DELAY_MS = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label) {
  let lastErr;
  for (let i = 0; i < RETRY_COUNT; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // eslint-disable-next-line no-console
      console.warn(`${label} attempt ${i + 1}/${RETRY_COUNT} failed:`, e);
      if (i < RETRY_COUNT - 1) await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, i));
    }
  }
  throw lastErr;
}

export async function storageGet(key, shared) {
  return withRetry(async () => {
    if (!shared) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("user_data")
        .select("value")
        .eq("user_id", user.id)
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return data ? data.value : null;
    }
    const { data, error } = await supabase
      .from("shared_data")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return data ? data.value : null;
  }, `storageGet(${key})`);
}

export async function storageSet(key, val, shared) {
  return withRetry(async () => {
    if (!shared) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("user_data")
        .upsert({ user_id: user.id, key, value: val }, { onConflict: "user_id,key" });
      if (error) throw error;
      return true;
    }
    const { error } = await supabase
      .from("shared_data")
      .upsert({ key, value: val }, { onConflict: "key" });
    if (error) throw error;
    return true;
  }, `storageSet(${key})`);
}

export async function storageDelete(key, shared) {
  return withRetry(async () => {
    if (!shared) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("user_data").delete().eq("user_id", user.id).eq("key", key);
      if (error) throw error;
      return true;
    }
    const { error } = await supabase.from("shared_data").delete().eq("key", key);
    if (error) throw error;
    return true;
  }, `storageDelete(${key})`);
}
