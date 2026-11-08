# Supabase Edge Functions

## `analyze-document`

This authenticated TypeScript/Deno function accepts extracted PDF text, a file name, and (for stored files) a file ID. It validates the caller and file ownership, calls Gemini using structured JSON output, validates the result, and saves analysis metadata for the caller's file. It receives text, not the PDF binary.

## `natural-language-search`

This authenticated function turns a natural-language request into filter fields. The browser applies those filters to the signed-in user's own file metadata query.

Required Edge Function secrets:

- `GEMINI_API_KEY`: set in Supabase Dashboard → Edge Functions → Secrets.
- `GEMINI_MODEL`: a model name currently available to the configured Gemini account.

Deploy from the project root with `npx supabase functions deploy analyze-document` and `npx supabase functions deploy natural-language-search`. The example file `.env.example` contains placeholders only. Never expose provider keys, Supabase secret keys, or service-role keys in frontend code.
