import { supabase } from "./supabaseClient.js";

// Shared data (class timetables, config, assignments) lives in the
// `shared_data` table — every classmate who opens the site sees the same thing.
//
// Personal data (your profile, your attendance marks, your assignment
// status) lives in the `user_data` table, scoped to your logged-in
// account via Row Level Security — so it follows you across devices,
// but nobody else can read or write it.

export async function storageGet(key, shared) {
  if (!shared) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from("user_data")
        .select("value")
        .eq("user_id", user.id)
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return data ? data.value : null;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("storageGet (personal) failed for", key, e);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    try {
      const { error } = await supabase
        .from("user_data")
        .upsert({ user_id: user.id, key, value: val }, { onConflict: "user_id,key" });
      if (error) throw error;
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("storageSet (personal) failed for", key, e);
      return false;
    }
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
