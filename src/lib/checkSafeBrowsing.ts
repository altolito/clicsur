export type SafeBrowsingResult = {
  dangerous: boolean;
  threats: string[];
};

export async function checkSafeBrowsing(
  url: string
): Promise<SafeBrowsingResult> {
  try {
    const response = await fetch("/api/check-safe-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      return {
        dangerous: false,
        threats: [],
      };
    }

    const data = await response.json();

    console.log("SAFE BROWSING", url, data);

    return {
      dangerous: data.dangerous ?? false,
      threats: data.threats ?? [],
    };
  } catch (error) {
  console.error("SAFE BROWSING ERROR", error);

  return {
    dangerous: false,
    threats: [],
  };
  }
}