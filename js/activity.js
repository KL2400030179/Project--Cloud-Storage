import { supabaseClient } from "./config.js";

export async function logActivity(userId, action, fileId = null, fileName = null) {
  const payload = {
    user_id: userId,
    action,
    file_id: fileId,
    file_name: fileName,
    created_at: new Date().toISOString()
  };

  const { error } = await supabaseClient.from("activity_logs").insert(payload);

  if (error) {
    console.error("Activity logging failed", error);
  }
}

export async function getRecentActivity(userId, limit = 5) {
  const { data, error } = await supabaseClient
    .from("activity_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Activity fetch failed", error);
    return [];
  }

  return data || [];
}

export function formatActivityTime(timestamp) {
  if (!timestamp) return "Just now";

  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatActionLabel(action) {
  const labels = {
    UPLOAD: "Uploaded",
    DOWNLOAD: "Downloaded",
    DELETE: "Deleted",
    TRASH: "Moved to recycle bin",
    RESTORE: "Restored",
    SHARE: "Shared",
    AI_SUMMARY: "Generated AI summary for",
    AI_CATEGORIZATION: "Categorized",
    AI_SEARCH: "AI search:",
    LOGIN: "Logged in",
    LOGOUT: "Logged out",
    DUPLICATE_DETECTED: "Duplicate detected"
  };

  return labels[action] || action;
}
