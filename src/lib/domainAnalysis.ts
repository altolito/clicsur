export type DomainAnalysis = {
  domain: string;
  scoreImpact: number;
  alerts: string[];
  technicalDetails: string[];
};

const SUSPICIOUS_EXTENSIONS = [
  ".xyz",
  ".top",
  ".click",
  ".shop",
  ".info",
  ".online",
  ".site",
  ".live",
  ".support",
];

const URL_SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "cutt.ly",
  "ow.ly",
  "is.gd",
  "shorturl.at",
];

export function extractDomain(rawUrl: string): string | null {
  try {
    const cleanedUrl = rawUrl.trim().replace(/[),.;!?]+$/g, "");

    const normalizedUrl =
      cleanedUrl.startsWith("http://") || cleanedUrl.startsWith("https://")
        ? cleanedUrl
        : `https://${cleanedUrl}`;

    return new URL(normalizedUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function analyzeDomain(rawUrl: string): DomainAnalysis | null {
  const domain = extractDomain(rawUrl);

  if (!domain) {
    return null;
  }

  let scoreImpact = 0;
  const alerts: string[] = [];
  const technicalDetails: string[] = [`Domaine détecté : ${domain}`];

  if (rawUrl.startsWith("http://")) {
    scoreImpact += 2;
    alerts.push("Le lien utilise HTTP au lieu de HTTPS.");
    technicalDetails.push("Protocole non sécurisé : HTTP");
  }

  if (domain.length > 30) {
    scoreImpact += 2;
    alerts.push("Le nom de domaine est anormalement long.");
    technicalDetails.push("Domaine long : oui");
  } else {
    technicalDetails.push("Domaine long : non");
  }

  if (/\d/.test(domain)) {
    scoreImpact += 1;
    alerts.push("Le domaine contient des chiffres.");
    technicalDetails.push("Chiffres dans le domaine : oui");
  }

  const dashCount = (domain.match(/-/g) || []).length;

  if (dashCount >= 2) {
    scoreImpact += 1;
    alerts.push("Le domaine contient plusieurs tirets.");
    technicalDetails.push(`Nombre de tirets : ${dashCount}`);
  }

  if (SUSPICIOUS_EXTENSIONS.some((extension) => domain.endsWith(extension))) {
    scoreImpact += 2;
    alerts.push(
      "Le domaine utilise une extension souvent présente dans des campagnes douteuses."
    );
    technicalDetails.push("Extension à surveiller : oui");
  }

  if (URL_SHORTENERS.some((shortener) => domain.includes(shortener))) {
    scoreImpact += 3;
    alerts.push("Le lien utilise probablement un raccourcisseur d’URL.");
    technicalDetails.push("Raccourcisseur d’URL : oui");
  }

  return {
    domain,
    scoreImpact,
    alerts,
    technicalDetails,
  };
}