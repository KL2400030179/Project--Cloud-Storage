import { supabaseClient } from "./config.js";

export async function getCurrentUser() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) {
    console.error("Auth check failed", error);
    return null;
  }

  return data?.user ?? null;
}

export async function signUp(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password
  });

  return { data, error };
}

export async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  return { data, error };
}

export async function signOutUser() {
  const { error } = await supabaseClient.auth.signOut();
  return { error };
}

export async function getSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  return { data, error };
}
