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
    m4v: "Video",
    mp3: "Audio",
    wav: "Audio",
    ogg: "Audio",
    m4a: "Audio",
    flac: "Audio",
    zip: "Archive",
    rar: "Archive",
    "7z": "Archive",
    js: "Code",
    py: "Code",
    java: "Code",
    ts: "Code",
    tsx: "Code",
    jsx: "Code",
    go: "Code",
    rs: "Code",
    c: "Code",
    cpp: "Code",
    cs: "Code",
    php: "Code",
    rb: "Code",
    sh: "Code",
    sql: "Code",
    md: "Code",
    css: "Code",
    html: "Code",
    json: "Code"
  };

  if (map[extension]) return map[extension];
  if ((mimeType || "").startsWith("image/")) return "Image";
  if ((mimeType || "").startsWith("video/")) return "Video";
  if ((mimeType || "").startsWith("audio/")) return "Audio";
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
      .is("deleted_at", null)
      .limit(1);

    if (error) {
      console.error("Duplicate lookup failed", error);
      return {
        exists: false,
        existingFile: null,
        dbReady: false,
        error: {
          message: `Duplicate detection failed: ${error.message}`
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
        message: caughtError instanceof Error
          ? `Duplicate detection failed: ${caughtError.message}`
          : "Duplicate detection failed because of an unexpected database error."
      }
    };
  }
}

export async function uploadFileToCloud(file, user) {
  if (!user?.id) {
    return { ok: false, message: "Please sign in before uploading files." };
  }

  const validation = validateFile(file);
  if (!validation.valid) {
    return { ok: false, message: validation.message };
  }

  let fileHash;
  try {
    fileHash = await computeFileHash(file);
  } catch (error) {
    console.error("File hashing failed:", error);
    return { ok: false, message: "Could not securely hash this file. Upload cancelled." };
  }

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
  const storagePath = `${user.id}/${crypto.randomUUID()}__${safeName}`;

  const { error: uploadError } = await supabaseClient.storage.from(BUCKET_NAME).upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || validation.mimeType || "application/octet-stream"
  });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    return { ok: false, message: `Upload failed: ${uploadError.message}` };
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
    const { error: cleanupError } = await supabaseClient.storage.from(BUCKET_NAME).remove([storagePath]);
    if (cleanupError) {
      console.error("Storage cleanup failed:", cleanupError);
    }

    return {
      ok: false,
      message: cleanupError
        ? `Metadata save failed and uploaded storage cleanup also failed: ${insertError.message}; ${cleanupError.message}`
        : `Metadata save failed: ${insertError.message}`
    };
  }

  return { ok: true, file: data };
}

export async function uploadFilesToCloud(files, user) {
  const results = [];
  for (const file of files) {
    try {
      results.push({ file, result: await uploadFileToCloud(file, user) });
    } catch (error) {
      console.error(`Upload failed for ${file?.name || "selected file"}:`, error);
      results.push({
        file,
        result: {
          ok: false,
          message: error instanceof Error ? error.message : "Unexpected upload failure."
        }
      });
    }
  }

  return results;
}

export async function listUserFiles(userId) {
  const { data, error } = await supabaseClient
    .from("files")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("List files failed:", error);
    return { files: [], error };
  }

  return { files: data || [], error: null };
}

export async function moveFileToTrash(file) {
  const { error } = await supabaseClient
    .from("files")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", file.id);

  if (error) {
    console.error("Move to trash failed:", error);
    return { ok: false, message: `Could not move file to trash: ${error.message}` };
  }

  return { ok: true };
}

export async function restoreFileFromTrash(file) {
  const { error } = await supabaseClient
    .from("files")
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", file.id);

  if (error) {
    console.error("Restore from trash failed:", error);
    return { ok: false, message: `Could not restore file: ${error.message}` };
  }

  return { ok: true };
}

export async function listTrashedFiles(userId) {
  const { data, error } = await supabaseClient
    .from("files")
    .select("*")
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    console.error("List trashed files failed:", error);
    return { files: [], error };
  }

  return { files: data || [], error: null };
}

export async function permanentlyDeleteStoredFile(file) {
  if (!file?.id || !file.deleted_at) {
    return { ok: false, message: "Only files already in the recycle bin can be permanently deleted." };
  }

  const { error: storageError } = await supabaseClient.storage.from(BUCKET_NAME).remove([file.storage_path]);
  if (storageError) {
    console.error("Permanent storage delete failed:", storageError);
    return { ok: false, message: `Could not permanently delete file: ${storageError.message}` };
  }

  const { error: metadataError } = await supabaseClient.from("files").delete().eq("id", file.id);
  if (metadataError) {
    console.error("Permanent metadata delete failed:", metadataError);
    return { ok: false, message: `File object deleted but metadata cleanup failed: ${metadataError.message}` };
  }

  return { ok: true };
}

export async function setFileFavorite(file, isFavorite) {
  const { error } = await supabaseClient
    .from("files")
    .update({ is_favorite: Boolean(isFavorite), updated_at: new Date().toISOString() })
    .eq("id", file.id);

  if (error) {
    console.error("Favorite update failed:", error);
    return { ok: false, message: `Could not update favorite: ${error.message}` };
  }

  return { ok: true };
}

export async function createFolder(userId, name, parentFolderId = null) {
  if (!userId || !name?.trim()) {
    return { ok: false, message: "A valid user and folder name are required." };
  }

  const { data, error } = await supabaseClient
    .from("folders")
    .insert({ user_id: userId, name: name.trim(), parent_folder_id: parentFolderId })
    .select()
    .single();

  if (error) {
    console.error("Folder creation failed:", error);
    return { ok: false, message: `Could not create folder: ${error.message}` };
  }

  return { ok: true, folder: data };
}

export async function listUserFolders(userId) {
  const { data, error } = await supabaseClient
    .from("folders")
    .select("id, parent_folder_id, name, created_at, updated_at")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) {
    console.error("Folder listing failed:", error);
    return { folders: [], error };
  }

  return { folders: data || [], error: null };
}

export async function moveFileToFolder(file, folderId = null) {
  const { error } = await supabaseClient
    .from("files")
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .eq("id", file.id);

  if (error) {
    console.error("Move file failed:", error);
    return { ok: false, message: `Could not move file: ${error.message}` };
  }

  return { ok: true };
}

export async function addFileTag(fileId, userId, tag) {
  const normalizedTag = String(tag || "").trim();
  if (!fileId || !userId || !normalizedTag || normalizedTag.length > 40) {
    return { ok: false, message: "A file, signed-in user, and tag of at most 40 characters are required." };
  }

  const { error } = await supabaseClient
    .from("file_tags")
    .insert({ file_id: fileId, user_id: userId, tag: normalizedTag });

  if (error) {
    console.error("Tag creation failed:", error);
    return { ok: false, message: `Could not add tag: ${error.message}` };
  }

  return { ok: true };
}

export async function listFileTags(fileId, userId) {
  const { data, error } = await supabaseClient
    .from("file_tags")
    .select("id, tag, created_at")
    .eq("file_id", fileId)
    .eq("user_id", userId)
    .order("tag", { ascending: true });

  if (error) {
    console.error("Tag listing failed:", error);
    return { tags: [], error };
  }

  return { tags: data || [], error: null };
}

export async function removeFileTag(tagId, fileId) {
  const { error } = await supabaseClient
    .from("file_tags")
    .delete()
    .eq("id", tagId)
    .eq("file_id", fileId);

  if (error) {
    console.error("Tag removal failed:", error);
    return { ok: false, message: `Could not remove tag: ${error.message}` };
  }

  return { ok: true };
}

export async function renameStoredFile(file, fileName) {
  const normalizedName = String(fileName || "").trim();
  if (!normalizedName || /[<>:"/\\|?*]/.test(normalizedName)) {
    return { ok: false, message: "Enter a valid file name without unsupported characters." };
  }

  const { error } = await supabaseClient
    .from("files")
    .update({ file_name: normalizedName, updated_at: new Date().toISOString() })
    .eq("id", file.id);

  if (error) {
    console.error("File rename failed:", error);
    return { ok: false, message: `Could not rename file: ${error.message}` };
  }

  return { ok: true };
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

export function generatePreviewForFile(file) {
  const extension = (file.file_name || "").split(".").pop()?.toLowerCase();
  const mime = file.mime_type || "";

  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "m4v"].includes(extension || "")) {
    return { kind: "video", url: null, name: file.file_name };
  }

  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "flac"].includes(extension || "")) {
    return { kind: "audio", url: null, name: file.file_name };
  }

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
