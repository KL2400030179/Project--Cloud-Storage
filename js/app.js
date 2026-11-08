import { BUCKET_NAME, supabaseClient } from "./config.js";
import { signUp, signIn, signOutUser, getSession } from "./auth.js";
import {
  uploadFilesToCloud,
  listUserFiles,
  downloadFile,
  createSignedShareLink,
  moveFileToTrash,
  listTrashedFiles,
  restoreFileFromTrash,
  permanentlyDeleteStoredFile,
  setFileFavorite,
  renameStoredFile,
  generatePreviewForFile
} from "./storage.js";
import { renderSummaryCards, renderStorageUsage, renderFileList, renderRecentActivity } from "./dashboard.js";
import { buildAnalytics, renderAnalyticsChart } from "./analytics.js";
import { filterFiles } from "./search.js";
import { getRecentActivity, logActivity } from "./activity.js";
import { formatFileSize } from "./edge.js";
import { initializeAppearance } from "./appearance.js";
import { extractPdfText, generateDocumentSummary, searchFilesWithAI } from "./ai.js";

const authScreen = document.getElementById("authScreen");
const dashboardScreen = document.getElementById("dashboardScreen");
const headerEmail = document.getElementById("headerEmail");
const headerLogoutBtn = document.getElementById("headerLogoutBtn");
const status = document.getElementById("status");
const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const uploadDropZone = document.getElementById("uploadDropZone");
const uploadBrowseBtn = document.getElementById("uploadBrowseBtn");
const shareModal = document.getElementById("shareModal");
const previewModal = document.getElementById("previewModal");
const shareUrlField = document.getElementById("shareUrlField");
const generateShareBtn = document.getElementById("generateShareBtn");
const copyShareBtn = document.getElementById("copyShareBtn");
const shareExpiration = document.getElementById("shareExpiration");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const sortSelect = document.getElementById("sortSelect");
const fileTypeFilter = document.getElementById("fileTypeFilter");
const filesSearchInput = document.getElementById("filesSearchInput");
const previewContent = document.getElementById("previewContent");

let currentUser = null;
let currentFiles = [];
let currentActivities = [];
let activeShareFile = null;
let selectedLocalPdf = null;

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  initializeAppearance();
  bindAuthForms();
  bindUploadActions();
  bindModalControls();
  bindSearchControls();
  bindNavigation();
  bindAISummary();
  bindAIFileSearch();
  initialSessionCheck();
}

function bindAuthForms() {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;

    if (!email || !password) {
      showToast("Please enter a valid email and password.", "error");
      return;
    }

    if (password.length < 6) {
      showToast("Password must be at least 6 characters long.", "error");
      return;
    }

    setButtonLoading(document.getElementById("registerBtn"), true, "Creating account...");
    const { data, error } = await signUp(email, password);
    setButtonLoading(document.getElementById("registerBtn"), false, "Create account");

    if (error) {
      showToast("Unable to create account. Please try again.", "error");
      setStatus("Registration failed. Please try again.");
      return;
    }

    if (data?.user) {
      showToast("Registration successful. Check your email if verification is required.", "success");
      setStatus("Account created successfully.");
      document.getElementById("registerEmail").value = "";
      document.getElementById("registerPassword").value = "";
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
      showToast("Please enter a valid email and password.", "error");
      return;
    }

    setButtonLoading(document.getElementById("loginBtn"), true, "Logging in...");
    const { data, error } = await signIn(email, password);
    setButtonLoading(document.getElementById("loginBtn"), false, "Login");

    if (error) {
      showToast("Unable to sign in. Please check your email and password.", "error");
      setStatus("Authentication failed. Please check your details.");
      return;
    }

    if (data?.user) {
      currentUser = data.user;
      await logActivity(currentUser.id, "LOGIN", null, currentUser.email);
      await loadDashboard();
      showToast("Welcome back to IntelliVault.", "success");
    }
  });

  headerLogoutBtn.addEventListener("click", async () => {
    if (!currentUser) return;

    const { error } = await signOutUser();
    if (error) {
      showToast("Unable to sign out. Please try again.", "error");
      return;
    }

    await logActivity(currentUser.id, "LOGOUT", null, currentUser.email);
    currentUser = null;
    currentFiles = [];
    currentActivities = [];
    resetAuthView();
    showToast("You have been logged out.", "success");
    setStatus("Signed out successfully.");
  });

  document.querySelector('[data-action="logout"]').addEventListener("click", () => headerLogoutBtn.click());
}

function bindUploadActions() {
  uploadBrowseBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const selectedFiles = Array.from(fileInput.files || []);
    if (selectedFiles.length) {
      setStatus(`${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected for upload.`);
    }
  });

  uploadBtn.addEventListener("click", async () => {
    const selectedFiles = Array.from(fileInput.files || []);
    if (!selectedFiles.length) {
      showToast("Please select a file to upload.", "error");
      return;
    }

    await uploadSelectedFiles(selectedFiles);
  });

  uploadDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadDropZone.classList.add("drag-over");
  });

  uploadDropZone.addEventListener("dragleave", () => {
    uploadDropZone.classList.remove("drag-over");
  });

  uploadDropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    uploadDropZone.classList.remove("drag-over");
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    if (!droppedFiles.length) return;
    await uploadSelectedFiles(droppedFiles);
  });

  uploadDropZone.addEventListener("click", () => fileInput.click());
}

async function uploadSelectedFiles(files) {
  if (!currentUser) {
    showToast("Please log in before uploading files.", "error");
    return;
  }

  uploadBtn.disabled = true;
  setStatus(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}...`);
  setEdgeProcessingStatus("Validating, hashing and checking selected files before upload.", "Processing");

  try {
    const results = await uploadFilesToCloud(files, currentUser);
    let uploadedCount = 0;
    let duplicateCount = 0;

    for (const { file, result } of results) {
      if (result.ok) {
        uploadedCount += 1;
        await logActivity(currentUser.id, "UPLOAD", result.file.id, file.name);
      } else {
        if (result.duplicate) {
          duplicateCount += 1;
          await logActivity(currentUser.id, "DUPLICATE_DETECTED", null, file.name);
        }
        showToast(`${file.name}: ${result.message}`, "error");
      }
    }

    fileInput.value = "";
    if (uploadedCount) {
      showToast(`${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded successfully.`, "success");
      await loadDashboard();
    }

    const failedCount = results.length - uploadedCount;
    const summary = `${uploadedCount} uploaded, ${failedCount} failed${duplicateCount ? ` (${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"})` : ""}.`;
    setStatus(summary);
    setEdgeProcessingStatus(summary, "Complete");
  } finally {
    uploadBtn.disabled = false;
  }
}

function setEdgeProcessingStatus(message, state) {
  const dashboardStatus = document.getElementById("edgeProcessingStatus");
  if (dashboardStatus) dashboardStatus.textContent = message;

  const pipelineStatus = document.getElementById("edgePipelineStatus");
  if (pipelineStatus) pipelineStatus.textContent = state;
}

function bindSearchControls() {
  searchInput.addEventListener("input", () => {
    filesSearchInput.value = searchInput.value;
    renderVisibleFiles();
    if (searchInput.value && !document.querySelector('[data-view="files"]').classList.contains("hidden")) return;
    if (searchInput.value && !document.querySelector('[data-view="dashboard"]').classList.contains("hidden")) navigateToPage("files");
  });
  filesSearchInput.addEventListener("input", () => {
    searchInput.value = filesSearchInput.value;
    renderVisibleFiles();
  });
  categoryFilter.addEventListener("change", renderVisibleFiles);
  fileTypeFilter.addEventListener("change", renderVisibleFiles);
  sortSelect.addEventListener("change", renderVisibleFiles);
  document.getElementById("quickSearchBtn").addEventListener("click", () => {
    navigateToPage("files");
    filesSearchInput.focus();
  });
  ["heroUploadBtn", "quickUploadBtn", "filesUploadBtn"].forEach((id) => {
    document.getElementById(id).addEventListener("click", () => document.getElementById("uploadBrowseBtn").click());
  });

  document.getElementById("aiSummaryDashboardBtn")?.addEventListener("click", () => {
    navigateToPage("ai");
    document.getElementById("aiExistingPdf")?.focus();
  });
  document.getElementById("aiCategoryDashboardBtn")?.addEventListener("click", () => {
    navigateToPage("files");
    filesSearchInput.focus();
  });
  document.getElementById("aiSearchDashboardBtn")?.addEventListener("click", () => {
    navigateToPage("ai");
    document.getElementById("aiSearchInput")?.focus();
  });
}

function bindAISummary() {
  const localPdfInput = document.getElementById("aiPdfInput");
  const existingPdfSelect = document.getElementById("aiExistingPdf");
  const generateButton = document.getElementById("aiGenerateBtn");

  localPdfInput.addEventListener("change", () => {
    selectedLocalPdf = localPdfInput.files?.[0] || null;
    if (selectedLocalPdf) existingPdfSelect.value = "";
    updateAISummarySelection();
  });
  existingPdfSelect.addEventListener("change", () => {
    if (existingPdfSelect.value) {
      selectedLocalPdf = null;
      localPdfInput.value = "";
    }
    updateAISummarySelection();
  });
  generateButton.addEventListener("click", () => {
    const storedPdf = currentFiles.find((file) => String(file.id) === existingPdfSelect.value);
    if (selectedLocalPdf) {
      startAISummary({ file: selectedLocalPdf });
    } else if (storedPdf) {
      startAISummary({ storedFile: storedPdf });
    }
  });
}

function bindAIFileSearch() {
  const form = document.getElementById("aiSearchForm");
  const input = document.getElementById("aiSearchInput");
  const button = document.getElementById("aiSearchBtn");

  if (!form || !input || !button) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      showToast("Enter a natural-language search request first.", "error");
      return;
    }

    button.disabled = true;
    button.textContent = "Understanding...";
    setStatus("Understanding your request...");
    document.getElementById("aiSearchStatus").textContent = "Understanding your request...";

    try {
      const aiResult = await searchFilesWithAI(query);
      const matches = await queryFilesByAiFilters(currentUser?.id, aiResult.filters, aiResult.explanation);
      renderAiSearchResults(matches, aiResult, query);
      setStatus(`Found ${matches.length} file${matches.length === 1 ? "" : "s"} for your search.`);
      await logActivity(currentUser.id, "AI_SEARCH", null, query);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI search is temporarily unavailable.";
      document.getElementById("aiSearchStatus").textContent = message;
      showToast(message, "error");
      setStatus(message);
    } finally {
      button.disabled = false;
      button.textContent = "Ask IntelliVault";
    }
  });
}

function updateAISummarySelection() {
  const existingPdfSelect = document.getElementById("aiExistingPdf");
  const selectedStored = currentFiles.find((file) => String(file.id) === existingPdfSelect.value);
  const selectedFile = selectedLocalPdf || selectedStored;
  const generateButton = document.getElementById("aiGenerateBtn");
  generateButton.disabled = !selectedFile;
  document.getElementById("aiSelectedPdfName").textContent = selectedFile?.name || selectedFile?.file_name || "No PDF selected";
}

function refreshAISummaryFileOptions() {
  const select = document.getElementById("aiExistingPdf");
  const pdfFiles = currentFiles.filter(isPdfFile);
  select.innerHTML = '<option value="">Choose an uploaded PDF</option>' + pdfFiles.map((file) =>
    `<option value="${escapeHtml(file.id)}">${escapeHtml(file.file_name)}</option>`
  ).join("");
  updateAISummarySelection();
}

function isPdfFile(file) {
  return file?.mime_type === "application/pdf" || file?.file_type === "PDF" || /\.pdf$/i.test(file?.file_name || "");
}

async function startAISummary({ file = null, storedFile = null, triggerButton = null, forceRefresh = false }) {
  if (!currentUser) {
    showToast("Please log in before generating an AI summary.", "error");
    return;
  }

  const fileName = file?.name || storedFile?.file_name || "document.pdf";
  const targetFile = storedFile || file;
  const modal = document.getElementById("aiSummaryModal");
  const generateButton = document.getElementById("aiGenerateBtn");
  const actionButtons = document.querySelectorAll('[data-action="ai-summary"]');
  const originalTriggerLabel = triggerButton?.textContent || "✦ AI Summary";
  const originalGenerateLabel = "Generate AI Summary";

  const cachedSummary = targetFile?.ai_summary && !forceRefresh && targetFile?.ai_analyzed_at && (!targetFile?.updated_at || new Date(targetFile.ai_analyzed_at) >= new Date(targetFile.updated_at));
  if (cachedSummary) {
    document.getElementById("aiSummaryFileName").textContent = fileName;
    document.getElementById("aiSummaryText").textContent = targetFile.ai_summary;
    document.getElementById("aiSummaryKeyPoints").replaceChildren(...(Array.isArray(targetFile.ai_keywords) ? targetFile.ai_keywords : []).map((point) => {
      const item = document.createElement("li");
      item.textContent = point;
      return item;
    }));
    document.getElementById("aiSummaryDocumentType").textContent = targetFile.ai_document_type || "Document";
    document.getElementById("aiSummaryCategory").textContent = targetFile.ai_suggested_category || "Other";
    document.getElementById("aiSummaryImportantTopics").replaceChildren(...(Array.isArray(targetFile.ai_keywords) ? targetFile.ai_keywords : []).map((point) => {
      const item = document.createElement("li");
      item.textContent = point;
      return item;
    }));
    document.getElementById("aiSummaryResults").classList.remove("hidden");
    document.getElementById("aiSummaryError").classList.add("hidden");
    setAISummaryStatus("Using cached AI result", "complete");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    if (triggerButton) triggerButton.textContent = "Cached summary";
    return;
  }

  if (triggerButton) triggerButton.disabled = true;
  generateButton.disabled = true;
  if (triggerButton) triggerButton.textContent = "Extracting PDF...";
  generateButton.textContent = "Extracting PDF...";
  actionButtons.forEach((button) => { button.disabled = true; });
  document.getElementById("aiSummaryFileName").textContent = fileName;
  document.getElementById("aiSummaryText").textContent = "";
  document.getElementById("aiSummaryKeyPoints").replaceChildren();
  document.getElementById("aiSummaryDocumentType").textContent = "";
  document.getElementById("aiSummaryCategory").textContent = "";
  document.getElementById("aiSummaryImportantTopics").replaceChildren();
  document.getElementById("aiSummaryResults").classList.add("hidden");
  document.getElementById("aiSummaryError").classList.add("hidden");
  setAISummaryStatus("Extracting text...", "processing");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  try {
    let pdfFile = file;
    if (storedFile) {
      const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).download(storedFile.storage_path);
      if (error || !data) throw new Error("Unable to read this PDF from private storage.");
      pdfFile = new File([data], storedFile.file_name, { type: storedFile.mime_type || "application/pdf" });
    }

    const extractedText = await extractPdfText(pdfFile, (page, total) => {
      setAISummaryStatus(`Extracting page ${page} of ${total}...`, "processing");
    });
    setAISummaryStatus("Analyzing document...", "processing");
    if (triggerButton) triggerButton.textContent = "Analyzing with AI...";
    generateButton.textContent = "Analyzing with AI...";

    const result = await generateDocumentSummary(extractedText, fileName, targetFile?.id || null);
    document.getElementById("aiSummaryText").textContent = result.summary;
    document.getElementById("aiSummaryKeyPoints").replaceChildren(...result.keyPoints.map((point) => {
      const item = document.createElement("li");
      item.textContent = point;
      return item;
    }));
    document.getElementById("aiSummaryDocumentType").textContent = result.documentType;
    document.getElementById("aiSummaryCategory").textContent = result.suggestedCategory || "Other";
    document.getElementById("aiSummaryImportantTopics").replaceChildren(...(result.importantTopics.length ? result.importantTopics : result.keywords).map((point) => {
      const item = document.createElement("li");
      item.textContent = point;
      return item;
    }));
    document.getElementById("aiSummaryResults").classList.remove("hidden");
    setAISummaryStatus("Complete", "complete");
    if (triggerButton) triggerButton.textContent = "Summary ready";
    generateButton.textContent = "Summary ready";
    await logActivity(currentUser.id, "AI_SUMMARY", targetFile?.id || null, fileName);
    await logActivity(currentUser.id, "AI_CATEGORIZATION", targetFile?.id || null, fileName);
    currentActivities = await getRecentActivity(currentUser.id, 100);
    renderRecentActivity(currentActivities.slice(0, 5));
    renderRecentActivity(currentActivities, "activityFullList");
    const analytics = buildAnalytics(currentFiles, currentActivities);
    renderAnalyticsSummary(analytics, currentActivities);

    if (targetFile && targetFile.id) {
      const index = currentFiles.findIndex((item) => String(item.id) === String(targetFile.id));
      if (index >= 0) {
        currentFiles[index] = {
          ...currentFiles[index],
          ai_summary: result.summary,
          ai_document_type: result.documentType,
          ai_suggested_category: result.suggestedCategory,
          ai_keywords: result.keywords.length ? result.keywords : result.keyPoints,
          ai_analyzed_at: new Date().toISOString()
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate the AI summary.";
    document.getElementById("aiSummaryError").textContent = message;
    document.getElementById("aiSummaryError").classList.remove("hidden");
    setAISummaryStatus("Summary unavailable", "error");
    showToast(message, "error");
  } finally {
    if (triggerButton?.isConnected) {
      triggerButton.disabled = false;
      if (document.getElementById("aiSummaryStatus").dataset.state === "error") triggerButton.textContent = originalTriggerLabel;
      else setTimeout(() => { if (triggerButton.isConnected) triggerButton.textContent = originalTriggerLabel; }, 1800);
    }
    actionButtons.forEach((button) => { button.disabled = false; });
    if (document.getElementById("aiSummaryStatus").dataset.state === "error") generateButton.textContent = originalGenerateLabel;
    else setTimeout(() => { generateButton.textContent = originalGenerateLabel; }, 1800);
    updateAISummarySelection();
  }
}

function setAISummaryStatus(message, state) {
  const statusContainer = document.getElementById("aiSummaryStatus");
  statusContainer.dataset.state = state;
  document.getElementById("aiSummaryStatusText").textContent = message;
}

function bindNavigation() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      navigateToPage(button.dataset.page);
    });
  });

  const sidebarToggle = document.getElementById("sidebarToggle");
  sidebarToggle.addEventListener("click", () => {
    const isOpen = document.getElementById("sidebar").classList.toggle("sidebar-open");
    sidebarToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

function navigateToPage(page) {
  const pageContent = {
    dashboard: ["Dashboard", "Your secure workspace at a glance."],
    files: ["My Files", "Browse and manage your private files."],
    shared: ["Shared Files", "Private links and sharing activity."],
    activity: ["Recent Activity", "A timeline of events in your workspace."],
    analytics: ["Analytics", "Live metrics calculated from your workspace."],
    trash: ["Recycle Bin", "Restore or permanently delete trashed files."],
    edge: ["Edge Processing", "How browser-side processing works with the cloud."],
    ai: ["AI Insights", "Planned document intelligence capabilities."],
    settings: ["Settings", "Account and workspace information."]
  };
  if (!pageContent[page]) return;

  if (page === "ai") {
    refreshAISummaryFileOptions();
  }

  document.querySelectorAll("[data-view]").forEach((view) => view.classList.toggle("hidden", view.dataset.view !== page));
  document.querySelectorAll(".nav-item[data-page]").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
  document.getElementById("pageTitle").textContent = pageContent[page][0];
  document.getElementById("pageDescription").textContent = pageContent[page][1];
  document.getElementById("sidebar").classList.remove("sidebar-open");
  document.getElementById("sidebarToggle").setAttribute("aria-expanded", "false");
  if (page === "shared") renderSharedFiles();
  if (page === "trash") renderTrashFiles();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindModalControls() {
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.closeModal;
      const modal = document.getElementById(key);
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    });
  });

  generateShareBtn.addEventListener("click", async () => {
    if (!activeShareFile || !currentUser) return;

    const expiry = Number(shareExpiration.value);
    const result = await createSignedShareLink(activeShareFile, expiry);

    if (!result.ok) {
      showToast(result.message || "Could not create a share link.", "error");
      return;
    }

    shareUrlField.value = result.signedUrl;
    copyShareBtn.classList.remove("hidden");
    await logActivity(currentUser.id, "SHARE", activeShareFile.id, activeShareFile.file_name);
    showToast("Secure link generated successfully.", "success");
    setStatus("Share link created successfully.");
  });

  copyShareBtn.addEventListener("click", async () => {
    const link = shareUrlField.value;
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      showToast("Share link copied to the clipboard.", "success");
    } catch (error) {
      showToast("Copy failed. You can copy the link manually.", "error");
    }
  });
}

async function initialSessionCheck() {
  const { data, error } = await getSession();
  if (error) {
    showToast("Unable to access your session.", "error");
    return;
  }

  if (data?.session?.user) {
    currentUser = data.session.user;
    await loadDashboard();
  } else {
    resetAuthView();
    setStatus("Supabase connected successfully.");
  }
}

function resetAuthView() {
  authScreen.classList.remove("hidden");
  dashboardScreen.classList.add("hidden");
  headerLogoutBtn.classList.add("hidden");
  headerEmail.textContent = "Not signed in";
  fileInput.value = "";
}

function showDashboardView() {
  authScreen.classList.add("hidden");
  dashboardScreen.classList.remove("hidden");
  headerLogoutBtn.classList.remove("hidden");
  headerEmail.textContent = currentUser?.email || "User";
  document.getElementById("userAvatar").textContent = (currentUser?.email || "IV").slice(0, 2).toUpperCase();
  navigateToPage("dashboard");
}

function setStatus(message) {
  status.textContent = message;
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.getElementById("toastContainer").appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3200);
}

function setButtonLoading(button, loading, label) {
  button.disabled = loading;
  button.textContent = loading ? label : button.dataset.originalLabel || label;
}

async function loadDashboard() {
  if (!currentUser) {
    resetAuthView();
    return;
  }

  showDashboardView();

  const fileResult = await listUserFiles(currentUser.id);
  if (fileResult.error) {
    showToast(`Could not load your files: ${fileResult.error.message}`, "error");
    setStatus("File listing is unavailable. Check your connection and database migration.");
    return;
  }
  currentFiles = fileResult.files;
  refreshAISummaryFileOptions();

  const activityItems = await getRecentActivity(currentUser.id, 100);
  currentActivities = activityItems;

  const analytics = buildAnalytics(currentFiles, activityItems);
  renderSummaryCards(analytics);
  renderStorageUsage(analytics.totalStorage);
  renderRecentActivity(activityItems.slice(0, 5));
  renderRecentActivity(activityItems, "activityFullList");
  document.getElementById("analyticsChart").innerHTML = renderAnalyticsChart(analytics.categoryCounts);
  renderAnalyticsSummary(analytics, activityItems);
  renderActivitySummary(activityItems);
  renderSharedFiles();
  renderVisibleFiles();
}

function renderVisibleFiles() {
  if (!currentUser) return;

  const searchText = filesSearchInput.value || searchInput.value;
  const category = categoryFilter.value;
  const sort = sortSelect.value;
  const fileType = fileTypeFilter.value;

  const filteredFiles = filterFiles(currentFiles, searchText, category, sort, fileType);
  const actions = [
    (file) => openPreview(file),
    async (file) => {
      const result = await downloadFile(file);
      if (result.ok) {
        await logActivity(currentUser.id, "DOWNLOAD", file.id, file.file_name);
        showToast("Download started.", "success");
      } else {
        showToast(result.message, "error");
      }
    },
    (file) => openShareModal(file),
    async (file) => {
      const confirmed = window.confirm("Are you sure you want to delete this file?");
      if (!confirmed) return;

      const result = await moveFileToTrash(file);
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }

      await logActivity(currentUser.id, "TRASH", file.id, file.file_name);
      showToast("File moved to the recycle bin.", "success");
      await loadDashboard();
    },
    (file, button) => startAISummary({ storedFile: file, triggerButton: button }),
    async (file) => {
      const result = await setFileFavorite(file, !file.is_favorite);
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      await loadDashboard();
    },
    async (file) => {
      const newName = window.prompt("Enter a new file name:", file.file_name);
      if (newName === null || newName.trim() === file.file_name) return;
      const result = await renameStoredFile(file, newName);
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      showToast("File renamed.", "success");
      await loadDashboard();
    }
  ];
  renderFileList(filteredFiles, ...actions, "fileList");
  renderFileList(filteredFiles.slice(0, 5), ...actions, "recentFilesList");
}

function renderAnalyticsSummary(analytics, activityItems) {
  const formatSize = (bytes) => formatFileSize(bytes);
  document.getElementById("analyticsTotalFiles").textContent = String(analytics.totalFiles);
  document.getElementById("analyticsStorageUsed").textContent = formatSize(analytics.totalStorage);
  document.getElementById("analyticsSharedFiles").textContent = String(analytics.sharedCount);
  document.getElementById("analyticsDuplicateFiles").textContent = String(analytics.duplicateCount);
  document.getElementById("analyticsUsedStorage").textContent = formatSize(analytics.totalStorage);
  document.getElementById("settingsStorageUsed").textContent = formatSize(analytics.totalStorage);
  document.getElementById("settingsEmail").textContent = currentUser?.email || "Not signed in";
  document.getElementById("analyticsChart").innerHTML = renderAnalyticsChart(analytics.categoryCounts);
  const actions = ["LOGIN", "LOGOUT", "UPLOAD", "DOWNLOAD", "TRASH", "SHARE", "DUPLICATE_DETECTED", "AI_SUMMARY", "AI_CATEGORIZATION", "AI_SEARCH"];
  document.getElementById("analyticsActivitySummary").innerHTML = actions.map((action) => {
    const count = activityItems.filter((item) => item.action === action).length;
    const label = action === "AI_SUMMARY" ? "AI SUMMARY" : action === "AI_CATEGORIZATION" ? "AI CATEGORIZATION" : action === "AI_SEARCH" ? "AI SEARCH" : action.replaceAll("_", " ");
    return `<div class="activity-summary-item"><span>${escapeHtml(label)}</span><strong>${count}</strong></div>`;
  }).join("");
}

function renderActivitySummary(items) {
  const summary = document.getElementById("activityList");
  if (!summary) return;
  renderRecentActivity(items.slice(0, 5));
}

function renderSharedFiles() {
  const activityItems = currentActivities;
  const sharedEvents = activityItems.filter((item) => item.action === "SHARE");
  const sharedFiles = document.getElementById("sharedFilesList");
  if (!sharedEvents.length) {
    sharedFiles.innerHTML = '<div class="empty-state">No share activity recorded yet.</div>';
    return;
  }
  sharedFiles.innerHTML = sharedEvents.map((event) => {
    const file = currentFiles.find((entry) => String(entry.id) === String(event.file_id));
    const name = file?.file_name || event.file_name || "Unavailable file";
    const action = file
      ? `<button class="button button-outline" type="button" data-share-file="${escapeHtml(file.id)}">Create signed link</button>`
      : '<button class="button button-quiet" type="button" disabled>File unavailable</button>';
    return `<article class="shared-item"><div class="shared-file-name"><span class="file-type-mark">↗</span><div><strong>${escapeHtml(name)}</strong><small>${event.created_at ? new Date(event.created_at).toLocaleString() : "Date unavailable"}</small></div></div><span class="shared-meta">${event.created_at ? new Date(event.created_at).toLocaleDateString() : "Unknown"}</span><span class="shared-meta">Set when generating</span><span class="permission-label">Read only</span><div class="shared-actions">${action}<button class="button button-quiet" type="button" disabled title="Signed links cannot be revoked before their expiration.">Revoke unavailable</button></div></article>`;
  }).join("");
  sharedFiles.querySelectorAll("[data-share-file]").forEach((button) => {
    button.addEventListener("click", () => {
      const file = currentFiles.find((entry) => String(entry.id) === button.dataset.shareFile);
      if (file) openShareModal(file);
    });
  });
}

async function renderTrashFiles() {
  const container = document.getElementById("trashFileList");
  if (!container || !currentUser) return;

  const { files, error } = await listTrashedFiles(currentUser.id);
  if (error) {
    console.error("Trash listing failed:", error);
    container.innerHTML = `<div class="empty-state">Could not load recycle bin: ${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!files.length) {
    container.innerHTML = '<div class="empty-state">Recycle bin is empty.</div>';
    return;
  }

  container.innerHTML = files.map((file) => `
    <article class="file-item">
      <div class="file-main"><div class="file-text">
        <p class="file-name">${escapeHtml(file.file_name)}</p>
        <div class="file-meta"><span>${escapeHtml(file.file_type || "File")}</span><span>${formatFileSize(Number(file.file_size || 0))}</span><span>Deleted ${file.deleted_at ? new Date(file.deleted_at).toLocaleDateString() : "date unavailable"}</span></div>
      </div></div>
      <div class="file-actions">
        <button class="button button-outline" type="button" data-restore-file="${escapeHtml(file.id)}">Restore</button>
        <button class="button button-quiet" type="button" data-permanently-delete="${escapeHtml(file.id)}">Delete permanently</button>
      </div>
    </article>
  `).join("");

  container.querySelectorAll("[data-restore-file]").forEach((button) => {
    button.addEventListener("click", async () => {
      const file = files.find((item) => String(item.id) === button.dataset.restoreFile);
      if (!file) return;
      const result = await restoreFileFromTrash(file);
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      await logActivity(currentUser.id, "RESTORE", file.id, file.file_name);
      showToast("File restored.", "success");
      await loadDashboard();
      await renderTrashFiles();
    });
  });

  container.querySelectorAll("[data-permanently-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const file = files.find((item) => String(item.id) === button.dataset.permanentlyDelete);
      if (!file || !window.confirm(`Permanently delete "${file.file_name}"? This cannot be undone.`)) return;
      const result = await permanentlyDeleteStoredFile(file);
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      await logActivity(currentUser.id, "DELETE", file.id, file.file_name);
      showToast("File permanently deleted.", "success");
      await loadDashboard();
      await renderTrashFiles();
    });
  });
}

async function queryFilesByAiFilters(userId, filters, explanation = "") {
  if (!userId) {
    throw new Error("Please log in before searching your files.");
  }

  let query = supabaseClient.from("files").select("*").eq("user_id", userId).is("deleted_at", null);

  if (filters?.category) {
    query = query.or(`ai_suggested_category.eq.${filters.category},category.eq.${filters.category}`);
  }
  if (filters?.mimeType) {
    query = query.eq("mime_type", filters.mimeType);
  }
  if (filters?.searchText) {
    query = query.ilike("file_name", `%${filters.searchText}%`);
  }
  if (filters?.dateFrom) {
    query = query.gte("created_at", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte("created_at", filters.dateTo);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    console.error("AI search query failed", error);
    throw new Error("AI search could not find matching files. Please try again.");
  }

  const matches = Array.isArray(data) ? data : [];
  if (matches.length) {
    renderAiSearchStatus(`${explanation || "Searching your files..."} Results found: ${matches.length}`);
  }
  return matches;
}

function renderAiSearchStatus(message) {
  const status = document.getElementById("aiSearchStatus");
  if (status) status.textContent = message;
}

function renderAiSearchResults(files, aiResult, query) {
  const container = document.getElementById("aiSearchResults");
  if (!container) return;

  const matches = files || [];
  if (!matches.length) {
    container.innerHTML = '<div class="empty-state">No matching files found for your request.</div>';
    renderAiSearchStatus(`No results found for "${escapeHtml(query)}".`);
    return;
  }

  const resultMarkup = matches.map((file) => `
    <article class="file-item ai-search-item" data-file-id="${escapeHtml(file.id)}">
      <div class="file-main"><div class="file-icon">${getFileEmoji(file.file_type, file.category)}</div><div class="file-text"><p class="file-name" title="${escapeHtml(file.file_name)}">${escapeHtml(file.file_name)}</p><div class="file-meta"><span>${escapeHtml(file.file_type || "File")}</span><span>${formatFileSize(Number(file.file_size || 0))}</span><span>${escapeHtml(file.ai_suggested_category || file.category || "Other")}</span></div></div></div>
      <div class="file-actions">
        <button class="file-action-btn preview" type="button" data-action="preview" data-file-id="${escapeHtml(file.id)}" aria-label="Open ${escapeHtml(file.file_name)}">↗</button>
        <button class="file-action-btn download" type="button" data-action="download" data-file-id="${escapeHtml(file.id)}" aria-label="Download ${escapeHtml(file.file_name)}">↓</button>
      </div>
    </article>
  `).join("");

  container.innerHTML = `
    <div class="ai-search-summary">
      <strong>Results found: ${matches.length}</strong>
      <span>${escapeHtml(aiResult?.filters?.category || "Files")}</span>
    </div>
    ${resultMarkup}
  `;

  container.querySelectorAll("[data-action='preview']").forEach((button) => {
    button.addEventListener("click", () => {
      const fileId = button.dataset.fileId;
      const target = matches.find((entry) => String(entry.id) === String(fileId));
      if (target) openPreview(target);
    });
  });

  container.querySelectorAll("[data-action='download']").forEach((button) => {
    button.addEventListener("click", async () => {
      const fileId = button.dataset.fileId;
      const target = matches.find((entry) => String(entry.id) === String(fileId));
      if (!target) return;
      const result = await downloadFile(target);
      if (result.ok) {
        await logActivity(currentUser.id, "DOWNLOAD", target.id, target.file_name);
        showToast("Download started.", "success");
      } else {
        showToast(result.message, "error");
      }
    });
  });

  renderAiSearchStatus(`${aiResult?.explanation || "Searching your files..."} Results found: ${matches.length}`);
}

function getFileEmoji(fileType, category) {
  const map = {
    Documents: "📄",
    Spreadsheets: "▦",
    Presentation: "📊",
    Images: "🖼️",
    Videos: "🎬",
    Audio: "🎵",
    Archives: "🗜️",
    Code: "💻",
    Other: "📦"
  };

  return map[category] || map[fileType] || "📄";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function openShareModal(file) {
  activeShareFile = file;
  shareUrlField.value = "";
  copyShareBtn.classList.add("hidden");
  shareModal.classList.remove("hidden");
  shareModal.setAttribute("aria-hidden", "false");
}

async function openPreview(file) {
  const preview = generatePreviewForFile(file);
  previewContent.innerHTML = "";

  if (preview.kind === "image") {
    const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).download(file.storage_path);
    if (error) {
      showToast("Unable to preview this image.", "error");
      return;
    }

    if (preview.kind === "video" || preview.kind === "audio") {
      const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).download(file.storage_path);
      if (error) {
        showToast(`Unable to preview this media: ${error.message}`, "error");
        return;
      }

      const mediaUrl = URL.createObjectURL(data);
      const media = document.createElement(preview.kind);
      media.src = mediaUrl;
      media.controls = true;
      media.preload = "metadata";
      media.className = "preview-file";
      previewContent.appendChild(media);
      previewModal.classList.remove("hidden");
      previewModal.setAttribute("aria-hidden", "false");
      return;
    }

    const imageUrl = URL.createObjectURL(data);
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = file.file_name;
    img.className = "preview-image";
    previewContent.appendChild(img);
    previewModal.classList.remove("hidden");
    previewModal.setAttribute("aria-hidden", "false");
    return;
  }

  if (preview.kind === "pdf") {
    const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(file.storage_path, 3600);
    if (!error && data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener");
      showToast("PDF preview opened in a new tab.", "success");
      return;
    }
  }

  if (preview.kind === "text") {
    const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).download(file.storage_path);
    if (!error && data) {
      const text = await data.text();
      const pre = document.createElement("pre");
      pre.textContent = text.slice(0, 4000) || "No readable text available.";
      pre.className = "preview-file";
      previewContent.appendChild(pre);
      previewModal.classList.remove("hidden");
      previewModal.setAttribute("aria-hidden", "false");
      return;
    }
  }

  const info = document.createElement("div");
  info.className = "preview-file";
  info.innerHTML = `
    <p><strong>File:</strong> ${file.file_name}</p>
    <p><strong>Type:</strong> ${file.file_type || "File"}</p>
    <p><strong>Category:</strong> ${file.category || "Other"}</p>
    <p><strong>Size:</strong> ${file.file_size ? (Number(file.file_size) / 1024).toFixed(2) + " KB" : "Unknown"}</p>
    <p>Preview not supported in browser.</p>
  `;
  previewContent.appendChild(info);
  previewModal.classList.remove("hidden");
  previewModal.setAttribute("aria-hidden", "false");
}

const originalRegisterLabel = document.getElementById("registerBtn").textContent;
const originalLoginLabel = document.getElementById("loginBtn").textContent;

document.getElementById("registerBtn").dataset.originalLabel = originalRegisterLabel;
document.getElementById("loginBtn").dataset.originalLabel = originalLoginLabel;
