import { BUCKET_NAME, supabaseClient } from "./config.js";
import { validateFile, computeFileHash, formatFileSize } from "./edge.js";

export function getFileType(fileName, mimeType = "") {
  const extension = fileName.split(".").pop()?.toLowerCase();

  const map = {
    pdf: "PDF",
    txt: "Text",
    doc: "Document",
    docx: "Document",
    xls: "Spreadsheet",
    xlsx: "Spreadsheet",
    csv: "Spreadsheet",
    ppt: "Presentation",
    pptx: "Presentation",
    jpg: "Image",
    jpeg: "Image",
    png: "Image",
    gif: "Image",
    webp: "Image",
    mp4: "Video",
    webm: "Video",
    mov: "Video",
    mp3: "Audio",
    wav: "Audio",
    ogg: "Audio",
    zip: "Archive",
    rar: "Archive",
    "7z": "Archive",
    js: "Code",
    py: "Code",
    java: "Code",
    css: "Code",
    html: "Code",
    json: "Code"
  };

  if (map[extension]) return map[extension];
  if (["application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes((mimeType || "").toLowerCase())) {
    return "Presentation";
  }
  return "Other";
}

export async function checkDuplicateHash(userId, fileHash) {
  if (!userId || !fileHash) {
    return {
      exists: false,
      existingFile: null,
      dbReady: false,
      error: {
        message: "Duplicate detection requires a valid user session and file hash."
      }
    };
  }

  try {
    const { data, error } = await supabaseClient
      .from("files")
      .select("id, file_name, file_hash, storage_path, file_size, category, created_at")
      .eq("user_id", userId)
      .eq("file_hash", fileHash)
      .limit(1);

    if (error) {
      console.error("Duplicate lookup failed", error);
      return {
        exists: false,
        existingFile: null,
        dbReady: false,
        error: {
          message: "Duplicate detection temporarily unavailable."
        }
      };
    }

    const existingFile = data?.[0] ?? null;

    return {
      exists: Boolean(existingFile),
      existingFile,
      dbReady: true,
      error: null
    };
  } catch (caughtError) {
    console.error("Unexpected duplicate lookup failure", caughtError);

    return {
      exists: false,
      existingFile: null,
      dbReady: false,
      error: {
        message: "Duplicate detection temporarily unavailable."
      }
    };
  }
}

export async function uploadFileToCloud(file, user) {
  const validation = validateFile(file);
  if (!validation.valid) {
    return { ok: false, message: validation.message };
  }

  const fileHash = await computeFileHash(file);

  const duplicateCheck = await checkDuplicateHash(user.id, fileHash);
  if (duplicateCheck.error) {
    return { ok: false, message: duplicateCheck.error.message };
  }

  if (duplicateCheck.exists) {
    const existingFile = duplicateCheck.existingFile;
    const existingDate = existingFile?.created_at
      ? new Date(existingFile.created_at).toLocaleDateString()
      : "an earlier upload";

    return {
      ok: false,
      duplicate: true,
      message: "Duplicate file detected.",
      existingFileName: existingFile?.file_name || "existing file",
      existingFileDate: existingDate,
      detail: `Existing file: ${existingFile?.file_name || "unknown file"} (${existingDate})`
    };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${user.id}/${Date.now()}__${safeName}`;

  const { error: uploadError } = await supabaseClient.storage.from(BUCKET_NAME).upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || validation.mimeType || "application/octet-stream"
  });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    return { ok: false, message: "Upload failed. Please try again." };
  }

  const metadata = {
    user_id: user.id,
    file_name: file.name,
    storage_path: storagePath,
    file_type: getFileType(file.name, validation.mimeType),
    file_size: file.size,
    file_hash: fileHash,
    category: validation.category,
    mime_type: validation.mimeType,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error: insertError } = await supabaseClient
    .from("files")
    .insert(metadata)
    .select()
    .single();

  if (insertError) {
    console.error("Metadata insert failed:", insertError);
    try {
      await supabaseClient.storage.from(BUCKET_NAME).remove([storagePath]);
    } catch (removeError) {
      console.error("Cleanup failed:", removeError);
    }

    return { ok: false, message: "Upload failed. Please try again." };
  }

  return { ok: true, file: data };
}

export async function listUserFiles(userId) {
  const { data, error } = await supabaseClient
    .from("files")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("List files failed:", error);
    return { files: [], error };
  }

  return { files: data || [], error: null };
}

export async function downloadFile(file) {
  const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).download(file.storage_path);

  if (error) {
    console.error("Download failed:", error);
    return { ok: false, message: "Download failed. Please try again." };
  }

  const blobUrl = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = file.file_name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);

  return { ok: true };
}

export async function createSignedShareLink(file, expirySeconds = 3600) {
  const { data, error } = await supabaseClient.storage
    .from(BUCKET_NAME)
    .createSignedUrl(file.storage_path, expirySeconds);

  if (error) {
    console.error("Share link creation failed:", error);
    return { ok: false, message: "Could not create a secure share link." };
  }

  return { ok: true, signedUrl: data?.signedUrl || "" };
}

export async function deleteStoredFile(file) {
  const storageResult = await supabaseClient.storage.from(BUCKET_NAME).remove([file.storage_path]);

  if (storageResult.error) {
    console.error("Storage delete failed:", storageResult.error);
    return { ok: false, message: "Delete failed. Please try again." };
  }

  const { error: dbError } = await supabaseClient.from("files").delete().eq("id", file.id);

  if (dbError) {
    console.error("Metadata delete failed:", dbError);
    return { ok: false, message: "Delete failed. Please try again." };
  }

  return { ok: true };
}

export function generatePreviewForFile(file) {
  const extension = (file.file_name || "").split(".").pop()?.toLowerCase();
  const mime = file.mime_type || "";

  if (mime.startsWith("image/")) {
    return {
      kind: "image",
      url: null,
      name: file.file_name
    };
  }

  if (mime === "application/pdf" || extension === "pdf") {
    return {
      kind: "pdf",
      url: null,
      name: file.file_name
    };
  }

  if (mime.startsWith("text/") || ["txt", "md", "csv", "json", "js", "ts", "html", "css", "sql"].includes(extension || "")) {
    return {
      kind: "text",
      url: null,
      name: file.file_name
    };
  }

  return {
    kind: "info",
    url: null,
    name: file.file_name
  };
}

export function buildStorageStats(files) {
  const totalFiles = files.length;
  const totalStorage = files.reduce((sum, file) => sum + Number(file.file_size || 0), 0);

  return {
    totalFiles,
    totalStorage,
    totalStorageText: formatFileSize(totalStorage)
  };
}
