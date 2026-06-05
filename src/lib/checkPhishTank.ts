export type PhishTankResult = {
  listed: boolean;
  verified: boolean;
  valid: boolean;
  phishId?: string | null;
  phishDetailUrl?: string | null;
};

export async function checkPhishTank(url: string): Promise<PhishTankResult> {
  try {
    const response = await fetch("/api/check-phishtank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      return {
        listed: false,
        verified: false,
        valid: false,
      };
    }

    const data = await response.json();

    return {
      listed: data.listed ?? false,
      verified: data.verified ?? false,
      valid: data.valid ?? false,
      phishId: data.phishId ?? null,
      phishDetailUrl: data.phishDetailUrl ?? null,
    };
  } catch {
    return {
      listed: false,
      verified: false,
      valid: false,
    };
  }
}