/// <reference types="node" />

export default async function handler(req: any, res: any) {
  try {
    const url = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return res.status(500).json({
        error: "Variables Supabase manquantes",
      });
    }

    const response = await fetch(
      `${url}/rest/v1/analyses?select=id&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      }
    );

    return res.status(response.ok ? 200 : 500).json({
      success: response.ok,
      status: response.status,
      date: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message,
    });
  }
}