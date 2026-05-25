export type DomainReputation =
  | "trusted"
  | "marketing"
  | "suspicious"
  | "dangerous"
  | "unknown";

export type DomainReputationEntry = {
  reputation: DomainReputation;
  confidence: "low" | "medium" | "high";
  label: string;
  note: string;
};

export const DOMAIN_REPUTATION: Record<string, DomainReputationEntry> = {
  "lsms.fr": {
    reputation: "marketing",
    confidence: "high",
    label: "Plateforme SMS marketing",
    note: "Souvent utilisé pour des campagnes SMS commerciales.",
  },

  "brevo.com": {
    reputation: "marketing",
    confidence: "high",
    label: "Plateforme emailing marketing",
    note: "Plateforme connue d’envoi email/SMS.",
  },

  "sendinblue.com": {
    reputation: "marketing",
    confidence: "high",
    label: "Plateforme emailing marketing",
    note: "Ancien nom de Brevo.",
  },

  "mailchimp.com": {
    reputation: "marketing",
    confidence: "high",
    label: "Plateforme emailing marketing",
    note: "Plateforme connue d’email marketing.",
  },
};

export function getDomainReputation(domain: string) {
  const normalizedDomain = domain.toLowerCase();

  if (DOMAIN_REPUTATION[normalizedDomain]) {
    return DOMAIN_REPUTATION[normalizedDomain];
  }

  const parentDomain = Object.keys(DOMAIN_REPUTATION).find((knownDomain) =>
    normalizedDomain.endsWith(`.${knownDomain}`)
  );

  if (parentDomain) {
    return DOMAIN_REPUTATION[parentDomain];
  }

  return {
    reputation: "unknown",
    confidence: "low",
    label: "Domaine inconnu",
    note: "Aucune réputation connue pour ce domaine.",
  } satisfies DomainReputationEntry;
}