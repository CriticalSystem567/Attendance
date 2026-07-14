import { supabase } from "./supabaseClient.js";

// Shared data (branch timetables, config, assignments) lives in Supabase
// so every classmate who opens the site sees the same thing.
//
// Personal data (your profile, your attendance marks, your assignment
// status) lives in this browser's localStorage instead — there's no
// login system, so "personal" here means "on this device".

export async function storageGet(key, shared) {
  if (!shared) {
    try {
      const raw = localStorage.getItem("do_" + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  try {
    const { data, error } = await supabase
      .from("shared_data")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return data ? data.value : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("storageGet failed for", key, e);
    return null;
  }
}

export async function storageSet(key, val, shared) {
  if (!shared) {
    try {
      localStorage.setItem("do_" + key, JSON.stringify(val));
    } catch (e) {
      // ignore — quota errors etc.
    }
    return true;
  }
  try {
    const { error } = await supabase
      .from("shared_data")
      .upsert({ key, value: val }, { onConflict: "key" });
    if (error) throw error;
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("storageSet failed for", key, e);
    return false;
  }
}
