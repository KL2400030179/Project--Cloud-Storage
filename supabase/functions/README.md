# Supabase Edge Functions

## `summarize-document`

This authenticated TypeScript/Deno function accepts extracted PDF text and a file name, validates the caller and request size, calls Gemini using structured JSON output, validates that output, and returns a summary, key points, and detected document type. It does not receive or store the PDF itself.

Required Edge Function secrets:

- `GEMINI_API_KEY`: set in Supabase Dashboard → Edge Functions → Secrets.
- `GEMINI_MODEL`: a model name currently available to the configured Gemini account.

Deploy from the project root with `supabase functions deploy summarize-document`. The example file `.env.example` contains placeholders only. Never expose provider keys, Supabase secret keys, or service-role keys in frontend code.
