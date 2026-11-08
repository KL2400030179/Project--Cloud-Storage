# IntelliVault – Intelligent Cloud-Based File Storage, Secure Sharing and Edge-Assisted File Management System

## Overview

IntelliVault is a cloud-based file management system designed for secure storage, fast sharing, and edge-assisted validation. It uses Supabase for authentication and private file storage, while the browser handles local validation, metadata extraction, and SHA-256 hashing before the file is transferred to the cloud.

## AI Document Intelligence

### Architecture

```text
Browser
    ↓
PDF.js / Edge Processing
    ↓
Supabase Edge Function
    ↓
AI Provider (Gemini)
    ↓
Structured JSON
    ↓
Supabase Database
    ↓
IntelliVault UI
```

The AI flow uses secure server-side secrets and authenticated calls. The browser extracts PDF text locally, sends only the extracted readable text to a Supabase Edge Function, and the function validates the user, ownership, and request size before asking the AI provider for a strict JSON result. Results are cached in the `files` table and reused when the document has not changed.

### Implemented

1. PDF text extraction in the browser using PDF.js
2. PDF summarization through the authenticated `analyze-document` Supabase Edge Function
3. Smart categorization suggestions without overwriting the stored `files.category`
4. Natural-language search that converts a user request into structured filters before querying the database
5. AI result caching using `ai_summary`, `ai_document_type`, `ai_suggested_category`, `ai_keywords`, and `ai_analyzed_at`
6. RLS-based isolation so users only see their own AI metadata

### Future Enhancements

- OCR for scanned PDFs without embedded text
- Multi-document batch analysis
- Shared AI prompts and saved summaries
- Better confidence scoring and category refinement

### Backend deployment

The backend uses Supabase PostgreSQL, private Storage, row-level security, and authenticated Edge Functions. Deploy it from the workspace root:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase secrets set GEMINI_API_KEY="YOUR_GEMINI_API_KEY" GEMINI_MODEL="YOUR_GEMINI_MODEL"
npx supabase functions deploy analyze-document
npx supabase functions deploy natural-language-search
```

The migration creates the `files` and `activity_logs` tables, row-level policies, and a private `user-files` bucket with a 50 MB per-file limit. For manual SQL Editor setup, use [database/schema.sql](database/schema.sql) and [supabase/storage-policies.sql](supabase/storage-policies.sql).

Never commit a real provider key or Supabase secret/service-role key. Provider keys belong in Supabase Edge Function secrets; the browser uses only the Supabase publishable key.

## Problem Statement

Students and small teams often need a simple yet reliable cloud storage workflow with secure access control, file categorization, metadata tracking, and lightweight sharing. Most beginner projects only cover upload and download. IntelliVault adds privacy-aware storage, duplicate detection, analytics, and future AI-ready architecture while remaining easy to understand and run locally.

## Objectives

- Deliver a modern HTML + CSS + JavaScript cloud file storage dashboard.
- Preserve the working Supabase authentication and file upload experience.
- Add bucket-level security and signed URL sharing.
- Improve the user experience with search, filters, previews, and analytics.
- Demonstrate local edge preprocessing before cloud upload.
- Keep a professional student-project presentation quality.

## Features

- User registration and login
- Secure logout
- Private Supabase storage bucket named `user-files`
- Drag-and-drop upload and click-to-select upload
- Local file validation before upload
- SHA-256 hashing in the browser with `crypto.subtle.digest()`
- Duplicate detection using file hash comparison
- Metadata persistence in the `files` table
- Automatic category assignment
- Search, filter, and sort
- File preview for supported types
- Download, share, and delete actions
- Recent activity log
- Analytics panel and chart
- Edge processing card in the dashboard
- PDF text extraction and AI document summarization through an authenticated Supabase Edge Function
- AI document-type detection returned with each summary (does not overwrite the stored file category)
- AI summary activity logging

## Technology Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Supabase JavaScript client via CDN
- Supabase Auth
- Supabase Storage
- PostgreSQL database via Supabase

## Architecture

```text
Browser (HTML + CSS + JS)
    |
    v
Supabase Auth
    |
    v
Private Storage Bucket: user-files
    |
    +--> files metadata table
    +--> activity_logs table
    |
    v
Signed URL sharing for time-limited file access
```

## Cloud Computing Role

Supabase provides the cloud infrastructure layer for:

- User authentication
- Private file storage
- Metadata database tables
- Signed URLs for secure sharing
- Enterprise-style access control through RLS and policies

## Edge Computing Role

The browser acts as the edge layer. Before upload, the application performs:

- File type validation
- File size validation
- Metadata extraction
- SHA-256 hashing locally using the browser's cryptographic APIs
- Duplicate detection against the user's own file hashes

This means preprocessing happens near the user before data is transferred to the cloud.

## Security

- The bucket remains private.
- No service-role or secret key is placed in browser code.
- Only the public Supabase publishable key is used in the client.
- Signed URLs are time-limited and are used for secure sharing.
- Row Level Security is enabled in PostgreSQL.
- Users only access their own file metadata and activity records.

## Database Design

The project uses two primary tables:

1. `files`
   - Stores metadata for each user file
   - Includes user, path, hash, size, category, MIME type, and timestamps
2. `activity_logs`
   - Stores actions like upload, download, delete, share, login, logout, and duplicate detection

## How to Run Locally

1. Open a terminal.
2. Navigate to the IntelliVault folder.
3. Start a local web server:

```bash
python -m http.server 5500
```

4. Open the browser at:

```text
http://localhost:5500
```

## Supabase Setup

1. Create or use your existing Supabase project.
2. Ensure the storage bucket `user-files` exists and remains private. The migration creates it.
3. Add the existing Supabase URL and publishable key to the browser config from the current project.
4. Apply the Supabase migrations with `npx supabase db push`, or run `database/schema.sql` followed by `supabase/storage-policies.sql` in the SQL editor.

## AI Document Intelligence

### IMPLEMENTED

1. Browser-side PDF text extraction with PDF.js
2. AI document summarization through the `analyze-document` Supabase Edge Function
3. Structured summary, key points, and AI-detected document type
4. `AI_SUMMARY` activity logging for successfully generated summaries

Architecture:

```text
Browser
    -> PDF.js
    -> Supabase Edge Function (authenticated user JWT)
    -> Gemini API
    -> Structured JSON
    -> IntelliVault UI
```

For an existing vault PDF, IntelliVault downloads the private object for local text extraction and does not upload it again. Extracted text is limited to 60,000 characters before it is sent to the function. The AI-detected document type is shown with the result and does not overwrite the existing `files.category` value.

### Configure and deploy

1. In Supabase Dashboard, open **Edge Functions → Secrets**.
2. Add `GEMINI_API_KEY` with your real Gemini API key. Never put this key in browser code or commit it.
3. Add `GEMINI_MODEL` with a Gemini model currently enabled for your account. The function requires this configurable model name rather than relying on a hard-coded model.
4. Authenticate and link this workspace to the existing Supabase project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

5. Deploy the function from this project root:

```bash
npx supabase functions deploy analyze-document
```

The example file `supabase/functions/.env.example` contains placeholders only. The function authenticates the caller with their Supabase JWT, sends text (not the PDF) to Gemini, validates the structured response, and never returns or logs the provider key.

If `GEMINI_API_KEY` is missing, the UI receives: `AI service is not configured. Add GEMINI_API_KEY in Supabase Edge Function secrets.`

### NEXT FEATURES

- Smart categorization suggestions
- Natural-language file search

The AI summary requires a deployed Edge Function, a valid `GEMINI_API_KEY`, a supported configured `GEMINI_MODEL`, an authenticated session, and an extractable-text PDF.

## Storage Bucket Setup

The migration creates a private storage bucket named:

```text
user-files
```

Do not make it public. Sharing should occur through signed URLs with expiration times.

## Storage Policies

The project includes a private-bucket policy design in `supabase/storage-policies.sql` to ensure:

- Only authenticated users can upload
- Users can only access their own folders
- Users can only list their own files
- Users can only download their own files
- Users can only delete their own files

## Database Schema

The schema and deployable migration are stored in:

- `database/schema.sql`
- `supabase/migrations/`

It creates:

- `files`
- `activity_logs`
- indexes
- row-level security policies

## Screenshots

Add screenshots here later, for example:

- Landing/Login screen
- Dashboard summary
- Upload section
- File list with categories
- Share dialog
- Analytics view

## Future Enhancements

- Smart document categorization
- Search using natural-language queries
- OCR and text extraction
- File recommendations and duplicate cleanup tools
- Supabase Edge Functions integration with an AI inference service

## Testing

This is a browser-based project, so testing is primarily manual:

- Registration and login
- Upload and file listing
- Download and delete actions
- Signed link sharing
- Duplicate detection
- Search and filter behavior
- Responsive layout checks on mobile and desktop

## Project Workflow

```text
Register / Login
    |
    v
Browse dashboard
    |
    v
Upload file
    |
    +--> edge validation
    +--> hash generation
    +--> duplicate detection
    +--> cloud upload
    |
    v
Metadata saved to database
    |
    v
File listing, search, preview, share, and delete actions
    |
    v
Activity log + analytics update
```

## Supabase Edge Functions Architecture

```text
Browser
  |
  v
Supabase Edge Function
  |
    v
Gemini API (document summary function)
  |
  v
Result returned to browser
```

Keep AI provider credentials and API keys server-side in Supabase Edge Function secrets. Do not expose secrets in browser code.

## Signed URLs and Security

Signed URLs provide time-limited access to private files. They are ideal for sharing a document with a user without making the full bucket public. The application must set an expiration timeframe such as 1 hour, 1 day, or 7 days.
