import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const allowedCategories = [
  "Career",
  "Academic",
  "Internship",
  "Project",
  "Certificate",
  "Finance",
  "Personal",
  "Legal",
  "Business",
  "Research",
  "Other"
];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalizeCategory(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return allowedCategories.includes(text) ? text : "Other";
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication is required." }, 401);
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken) {
    return jsonResponse({ error: "Authentication is required." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !publishableKey) {
    return jsonResponse({ error: "Supabase authentication is not configured for this function." }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !user) {
    return jsonResponse({ error: "Authentication is required." }, 401);
  }

  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query || query.length < 3 || query.length > 500) {
    return jsonResponse({ error: "Please provide a valid search request." }, 400);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "AI service is not configured. Add GEMINI_API_KEY in Supabase Edge Function secrets." }, 503);
  }

  const model = Deno.env.get("GEMINI_MODEL")?.trim();
  if (!model || !/^[a-zA-Z0-9._-]+$/.test(model)) {
    return jsonResponse({ error: "AI service is not configured. Set GEMINI_MODEL in Supabase Edge Function secrets." }, 503);
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Convert this natural-language request into a structured set of safe file search filters. Only return JSON with keys: category, mimeType, searchText, dateFrom, dateTo. The category must be one of: Career, Academic, Internship, Project, Certificate, Finance, Personal, Legal, Business, Research, Other. If the request is about PDFs only, set mimeType to application/pdf. If the request is not about a specific category, use "Other". Do not generate SQL. User request: ${query}` }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              category: { type: "STRING" },
              mimeType: { type: "STRING" },
              searchText: { type: "STRING" },
              dateFrom: { type: "STRING" },
              dateTo: { type: "STRING" }
            },
            required: ["category", "searchText"]
          }
        }
      })
    });
  } catch {
    return jsonResponse({ error: "AI service is temporarily unavailable." }, 503);
  }

  if (geminiResponse.status === 429 || geminiResponse.status >= 500) {
    return jsonResponse({ error: "AI service is temporarily unavailable." }, 503);
  }
  if (!geminiResponse.ok) {
    return jsonResponse({ error: "AI search could not process this request." }, 502);
  }

  let geminiData: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  try {
    geminiData = await geminiResponse.json();
  } catch {
    return jsonResponse({ error: "AI search returned an invalid response." }, 502);
  }

  const responseText = geminiData.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!responseText) {
    return jsonResponse({ error: "AI search returned an empty response." }, 502);
  }

  let parsed: { category?: unknown; mimeType?: unknown; searchText?: unknown; dateFrom?: unknown; dateTo?: unknown };
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return jsonResponse({ error: "AI search returned an invalid JSON response." }, 502);
  }

  const category = normalizeCategory(parsed.category);
  const mimeType = typeof parsed.mimeType === "string" ? parsed.mimeType.trim() : "";
  const searchText = typeof parsed.searchText === "string" ? parsed.searchText.trim() : query;
  const dateFrom = typeof parsed.dateFrom === "string" && parsed.dateFrom.trim() ? parsed.dateFrom.trim() : "";
  const dateTo = typeof parsed.dateTo === "string" && parsed.dateTo.trim() ? parsed.dateTo.trim() : "";

  return jsonResponse({
    explanation: `Searching for ${category === "Other" ? "matching files" : category.toLowerCase()} files related to your request.`,
    filters: {
      category,
      mimeType: mimeType || "",
      searchText,
      dateFrom,
      dateTo,
      confidence: 0.9
    }
  });
});
