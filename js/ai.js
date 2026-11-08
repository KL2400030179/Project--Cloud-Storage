import { supabaseClient } from "./config.js";

export const MAX_SUMMARY_TEXT_LENGTH = 60000;
const PDFJS_MODULE_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
let pdfJsPromise;

export function isPdfFile(file) {
  if (!file) return false;
  const fileName = String(file.name || file.file_name || "");
  const mimeType = String(file.type || file.mime_type || "");
  return mimeType === "application/pdf" || /\.pdf$/i.test(fileName);
}

function readFunctionError(error, data) {
  if (data?.error) return data.error;
  if (error?.message) return error.message;
  if (typeof error?.context?.json === "function") {
    try {
      return error.context.json().then((payload) => payload?.error || "AI service is temporarily unavailable.");
    } catch {
      return "AI service is temporarily unavailable.";
    }
  }
  return "AI service is temporarily unavailable.";
}

export async function extractPdfText(file, onProgress = () => {}) {
  if (!isPdfFile(file)) {
    throw new Error("AI summarization currently supports PDF documents.");
  }

  const targetFile = file instanceof File ? file : new File([file], file?.name || "document.pdf", { type: "application/pdf" });
  if (targetFile.size > 50 * 1024 * 1024) {
    throw new Error("Document is too large for AI analysis. Try a smaller document.");
  }

  try {
    pdfJsPromise ||= import(PDFJS_MODULE_URL);
    const pdfjsLib = await pdfJsPromise;
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

    const pdfDocument = await pdfjsLib.getDocument({ data: await targetFile.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      onProgress(pageNumber, pdfDocument.numPages);
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText) pages.push(pageText);
    }

    const text = pages.join("\n\n").trim();
    if (!text) {
      throw new Error("This PDF does not contain extractable text.\nOCR support can be added later.");
    }

    return text.slice(0, MAX_SUMMARY_TEXT_LENGTH);
  } catch (error) {
    console.error("PDF extraction failed", error);
    const message = error instanceof Error ? error.message : "Unable to extract text from this document.";
    if (message.includes("extractable text")) {
      throw new Error(message);
    }
    throw new Error("Unable to extract text from this document.");
  }
}

export async function generateDocumentSummary(text, fileName = "document.pdf", fileId = null) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) throw new Error("No readable PDF text was extracted.");
  if (normalizedText.length > MAX_SUMMARY_TEXT_LENGTH) {
    throw new Error("Document is too large for AI analysis. Try a smaller document.");
  }

  const { data, error } = await supabaseClient.functions.invoke("analyze-document", {
    body: {
      fileId: fileId || null,
      fileName: String(fileName || "document.pdf").slice(0, 255),
      extractedText: normalizedText
    }
  });

  if (error) {
    const message = readFunctionError(error, data);
    throw new Error(message || "AI service is temporarily unavailable.");
  }

  const result = data?.result || data;
  const summary = typeof result?.summary === "string" ? result.summary.trim() : "";
  const keyPoints = Array.isArray(result?.keyPoints) ? result.keyPoints.filter((point) => typeof point === "string" && point.trim()) : [];
  const documentType = typeof result?.documentType === "string" ? result.documentType.trim() : "";
  const importantTopics = Array.isArray(result?.importantTopics) ? result.importantTopics.filter((point) => typeof point === "string" && point.trim()) : [];
  const suggestedCategory = typeof result?.suggestedCategory === "string" ? result.suggestedCategory.trim() : "";
  if (!summary || !documentType || keyPoints.length === 0) {
    throw new Error("AI service returned an invalid summary. Please try again.");
  }

  return {
    summary,
    keyPoints: keyPoints.map((point) => point.trim()),
    documentType,
    importantTopics: importantTopics.map((point) => point.trim()),
    suggestedCategory: suggestedCategory || "Other",
    keywords: Array.isArray(result?.keywords) ? result.keywords.filter((word) => typeof word === "string" && word.trim()) : [],
    confidence: typeof result?.confidence === "number" ? result.confidence : null
  };
}

export async function searchFilesWithAI(query) {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    throw new Error("Please enter a file search request.");
  }

  const { data, error } = await supabaseClient.functions.invoke("natural-language-search", {
    body: { query: normalizedQuery }
  });

  if (error) {
    const message = readFunctionError(error, data);
    throw new Error(message || "AI search is temporarily unavailable.");
  }

  const filters = data?.filters || data;
  if (!filters || typeof filters !== "object") {
    throw new Error("AI search returned an invalid result.");
  }

  return {
    explanation: typeof data?.explanation === "string" ? data.explanation : "Understanding your request...",
    filters: {
      category: typeof filters.category === "string" ? filters.category.trim() : "",
      mimeType: typeof filters.mimeType === "string" ? filters.mimeType.trim() : "",
      searchText: typeof filters.searchText === "string" ? filters.searchText.trim() : "",
      dateFrom: typeof filters.dateFrom === "string" ? filters.dateFrom : "",
      dateTo: typeof filters.dateTo === "string" ? filters.dateTo : "",
      confidence: typeof filters.confidence === "number" ? filters.confidence : null
    }
  };
}
