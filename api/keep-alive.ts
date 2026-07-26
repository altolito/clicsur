/// <reference types="node" />

export default async function handler(req: any, res: any) {
  const rawUrl = process.env.VITE_SUPABASE_URL;
  const rawKey = process.env.VITE_SUPABASE_ANON_KEY;

  const url = rawUrl?.trim();
  const anonKey = rawKey?.trim();

  if (!url || !anonKey) {
    return res.status(500).json({
      error: "Variables Supabase manquantes",
      hasUrl: Boolean(url),
      hasKey: Boolean(anonKey),
    });
  }

  try {
    const endpoint = new URL(
      "/rest/v1/analyses?select=id&limit=1",
      url
    ).toString();

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    const body = await response.text();

    return res.status(response.ok ? 200 : 500).json({
      success: response.ok,
      status: response.status,
      endpoint,
      response: body,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message,
      cause: error.cause?.message ?? null,
      code: error.cause?.code ?? null,
      urlStart: url.slice(0, 30),
      urlLength: url.length,
      keyPresent: Boolean(anonKey),
      keyLength: anonKey.length,
    });
  }
}