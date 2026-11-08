export const SUPABASE_URL = "https://wdyigxwsoqgcmupsungu.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WNev2miWg3UJyK9LbDIp1w_9er-Uuov";
export const BUCKET_NAME = "user-files";
export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const STORAGE_CAPACITY = 5 * 1024 * 1024 * 1024;

export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
