export function classifyFile(fileName, mimeType) {
  const lowerName = (fileName || "").toLowerCase();
  const lowerMime = (mimeType || "").toLowerCase();
  const extension = lowerName.match(/\.([a-z0-9]+)$/)?.[1] || "";
  const extensionCategories = {
    pdf: "Documents",
    doc: "Documents",
    docx: "Documents",
    txt: "Documents",
    xls: "Spreadsheets",
    xlsx: "Spreadsheets",
    csv: "Spreadsheets",
    ppt: "Presentation",
    pptx: "Presentation",
    png: "Images",
    jpg: "Images",
    jpeg: "Images",
    gif: "Images",
    webp: "Images",
    mp4: "Videos",
    webm: "Videos",
    mov: "Videos",
    mp3: "Audio",
    wav: "Audio",
    ogg: "Audio",
    zip: "Archives",
    rar: "Archives",
    "7z": "Archives",
    js: "Code",
    py: "Code",
    java: "Code",
    html: "Code",
    css: "Code",
    json: "Code"
  };

  if (extensionCategories[extension]) return extensionCategories[extension];

  if (lowerMime === "application/vnd.ms-powerpoint" || lowerMime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return "Presentation";
  }

  if (lowerMime.startsWith("image/")) {
    return "Images";
  }

  if (lowerMime.startsWith("video/")) {
    return "Videos";
  }

  if (lowerMime.startsWith("audio/")) {
    return "Audio";
  }

  if (lowerMime.includes("pdf") || lowerMime.includes("msword") || lowerMime.includes("wordprocessingml")) {
    return "Documents";
  }

  if (lowerMime.includes("spreadsheet") || lowerMime.includes("excel") || lowerMime === "text/csv") {
    return "Spreadsheets";
  }

  if (lowerMime.includes("zip") || lowerMime.includes("x-rar") || lowerMime.includes("7z")) {
    return "Archives";
  }

  if (lowerMime.includes("json") || ["text/javascript", "application/javascript"].includes(lowerMime)) {
    return "Code";
  }

  return "Other";
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

export function validateFile(file) {
  if (!file) {
    return { valid: false, message: "Please select a file." };
  }

  if (file.size === 0) {
    return { valid: false, message: "Empty files cannot be uploaded." };
  }

  if (file.size > 50 * 1024 * 1024) {
    return { valid: false, message: "File size exceeds the 50 MB upload limit." };
  }

  const fileName = file.name || "untitled";
  if (!fileName.trim()) {
    return { valid: false, message: "The file name is invalid." };
  }

  const invalidPattern = /[<>:"/\\|?*]/;
  if (invalidPattern.test(fileName)) {
    return { valid: false, message: "Remove unsupported characters from the file name." };
  }

  const extension = fileName.split(".").pop()?.toLowerCase();
  const presentationMimeTypes = {
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  };
  const mimeType = presentationMimeTypes[extension] || file.type || "application/octet-stream";

  return {
    valid: true,
    fileName,
    mimeType,
    category: classifyFile(fileName, mimeType)
  };
}

export async function computeFileHash(file) {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getFileExtension(fileName) {
  const match = fileName.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "file";
}
