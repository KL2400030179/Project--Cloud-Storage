import { formatFileSize } from "./edge.js";
import { formatActivityTime, formatActionLabel } from "./activity.js";

export function renderSummaryCards(summary) {
  document.getElementById("totalFilesValue").textContent = String(summary.totalFiles || 0);
  document.getElementById("totalStorageValue").textContent = formatFileSize(summary.totalStorage || 0);
  document.getElementById("sharedFilesValue").textContent = String(summary.sharedCount || 0);
  document.getElementById("duplicateFilesValue").textContent = String(summary.duplicateCount || 0);
}

export function renderStorageUsage(usedBytes) {
  const used = document.getElementById("usedStorageValue");
  if (used) used.textContent = formatFileSize(usedBytes);
}

export function renderFileList(files, onPreview, onDownload, onShare, onDelete, onAiSummary, onFavorite, onRename, containerId = "fileList") {
  const container = document.getElementById(containerId);

  if (!files || files.length === 0) {
    container.innerHTML = containerId === "fileList"
      ? '<div class="file-table-wrap"><table class="file-table"><thead><tr><th scope="col">File</th><th scope="col">Type</th><th scope="col">Size</th><th scope="col">Category</th><th scope="col">Upload date</th><th scope="col">Actions</th></tr></thead><tbody><tr><td colspan="6"><div class="empty-state">No files uploaded yet.</div></td></tr></tbody></table></div>'
      : '<div class="empty-state">No files uploaded yet.</div>';
    return;
  }

  const fileMarkup = files.map((file) => {
      const duplicateTag = file.file_hash && file.file_hash.length > 0 && files.filter((item) => item.file_hash === file.file_hash).length > 1
        ? '<span class="badge duplicate">Duplicate</span>'
        : "";
      const safeName = escapeHtml(file.file_name || "Untitled file");
      const safeId = escapeHtml(file.id);
      const fileType = escapeHtml(file.file_type || "File");
      const fileCategory = escapeHtml(file.category || "Other");
      const date = new Date(file.created_at || Date.now()).toLocaleDateString();
      const isPdf = file.mime_type === "application/pdf" || file.file_type === "PDF" || /\.pdf$/i.test(file.file_name || "");
      const aiSummaryButton = isPdf
        ? `<button class="file-action-btn ai-summary-action" data-action="ai-summary" data-file-id="${safeId}" aria-label="AI Summary for ${safeName}" title="Generate AI Summary">✦ <span>AI Summary</span></button>`
        : "";
      const favoriteButton = `<button class="file-action-btn" data-action="favorite" data-file-id="${safeId}" aria-label="${file.is_favorite ? "Remove from" : "Add to"} favorites: ${safeName}" title="${file.is_favorite ? "Remove from" : "Add to"} favorites">${file.is_favorite ? "★" : "☆"}</button>`;
      const actions = `
        <div class="file-actions">
          <button class="file-action-btn preview" data-action="preview" data-file-id="${safeId}" aria-label="Open ${safeName}" title="Open file">↗</button>
          ${favoriteButton}
          <button class="file-action-btn" data-action="rename" data-file-id="${safeId}" aria-label="Rename ${safeName}" title="Rename">✎</button>
          ${aiSummaryButton}
          <button class="file-action-btn download" data-action="download" data-file-id="${safeId}" aria-label="Download ${safeName}" title="Download">↓</button>
          <button class="file-action-btn share" data-action="share" data-file-id="${safeId}" aria-label="Share ${safeName}" title="Share">↗</button>
          <button class="file-action-btn delete" data-action="delete" data-file-id="${safeId}" aria-label="Delete ${safeName}" title="Delete">×</button>
        </div>`;

      if (containerId === "fileList") {
        return `<tr class="file-row" data-file-id="${safeId}">
          <td><div class="file-main"><div class="file-icon">${getFileEmoji(file.file_type, file.category)}</div><div class="file-text"><p class="file-name" title="${safeName}">${safeName}</p></div></div></td>
          <td>${fileType}</td>
          <td>${formatFileSize(Number(file.file_size || 0))}</td>
          <td>${fileCategory} ${duplicateTag}</td>
          <td>${date}</td>
          <td>${actions}</td>
        </tr>`;
      }

      return `<article class="file-item" data-file-id="${safeId}">
        <div class="file-main"><div class="file-icon">${getFileEmoji(file.file_type, file.category)}</div><div class="file-text"><p class="file-name" title="${safeName}">${safeName}</p><div class="file-meta"><span>${fileType}</span><span>${formatFileSize(Number(file.file_size || 0))}</span><span>${fileCategory}</span>${duplicateTag}<span>${date}</span></div></div></div>${actions}
      </article>`;
    }).join("");

  container.innerHTML = containerId === "fileList"
    ? `<div class="file-table-wrap"><table class="file-table"><thead><tr><th scope="col">File</th><th scope="col">Type</th><th scope="col">Size</th><th scope="col">Category</th><th scope="col">Upload date</th><th scope="col">Actions</th></tr></thead><tbody>${fileMarkup}</tbody></table></div>`
    : fileMarkup;

  container.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const fileId = button.dataset.fileId;
      const file = files.find((entry) => String(entry.id) === String(fileId));
      if (!file) return;

      const action = button.dataset.action;
      if (action === "ai-summary") onAiSummary(file, button);
      if (action === "preview") onPreview(file);
      if (action === "download") onDownload(file);
      if (action === "share") onShare(file);
      if (action === "delete") onDelete(file);
      if (action === "favorite" && onFavorite) onFavorite(file);
      if (action === "rename" && onRename) onRename(file);
    });
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function renderRecentActivity(items, containerId = "activityList") {
  const container = document.getElementById(containerId);

  if (!items || !items.length) {
    container.innerHTML = '<div class="empty-state">No recent activity.</div>';
    return;
  }

  container.innerHTML = items
    .map((item) => `
      <div class="activity-item">
        <span class="activity-marker" aria-hidden="true">${getActivityMark(item.action)}</span>
        <div class="activity-detail"><div class="activity-text">${formatActionLabel(item.action)} ${item.file_name || "your account"}</div><div class="activity-time">${formatActivityTime(item.created_at)}</div></div>
      </div>
    `)
    .join("");
}

function getActivityMark(action) {
  const marks = { LOGIN: "↪", LOGOUT: "↗", UPLOAD: "↑", DOWNLOAD: "↓", DELETE: "×", TRASH: "⌫", RESTORE: "↶", SHARE: "↗", DUPLICATE_DETECTED: "⧉" };
  return marks[action] || "•";
}

function getFileEmoji(fileType, category) {
  const map = {
    "Documents": "📄",
    "Spreadsheets": "▦",
    "Presentation": "📊",
    "Images": "🖼️",
    "Videos": "🎬",
    "Audio": "🎵",
    "Archives": "🗜️",
    "Code": "💻",
    "Other": "📦"
  };

  return map[category] || map[fileType] || "📄";
}
