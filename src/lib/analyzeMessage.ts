export type AnalysisResult = {
  risk: "Faible" | "Moyen" | "Élevé";
  color: "emerald" | "yellow" | "red";
  score: number;
  alerts: string[];
  recommendation: string;
};

export function analyzeMessage(text: string): AnalysisResult {
  const lower = text.toLowerCase();

  let score = 0;
  const alerts: string[] = [];

  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const urls = text.match(urlRegex) || [];

  if (urls.length > 0) {
    score += 2;
    alerts.push("Un lien a été détecté dans le message.");
  }

  if (urls.some((url) => url.length > 80)) {
    score += 2;
    alerts.push("L’URL semble anormalement longue.");
  }

  if (
    lower.includes("bit.ly") ||
    lower.includes("tinyurl") ||
    lower.includes("t.co") ||
    lower.includes("goo.gl") ||
    lower.includes("cutt.ly") ||
    lower.includes("shorturl")
  ) {
    score += 3;
    alerts.push("Le lien semble utiliser un raccourcisseur d’URL.");
  }

  if (
    lower.includes(".xyz") ||
    lower.includes(".top") ||
    lower.includes(".click") ||
    lower.includes(".shop") ||
    lower.includes(".info")
  ) {
    score += 2;
    alerts.push("Le domaine utilise une extension souvent présente dans des campagnes douteuses.");
  }

  if (
    lower.includes("urgence") ||
    lower.includes("immédiat") ||
    lower.includes("rapidement") ||
    lower.includes("dernier rappel") ||
    lower.includes("sous 24h") ||
    lower.includes("expire")
  ) {
    score += 2;
    alerts.push("Le message crée un sentiment d’urgence.");
  }

  if (
    lower.includes("paiement") ||
    lower.includes("carte bancaire") ||
    lower.includes("virement") ||
    lower.includes("1,99€") ||
    lower.includes("frais") ||
    lower.includes("régulariser")
  ) {
    score += 3;
    alerts.push("Une demande de paiement a été détectée.");
  }

  if (
    lower.includes("mot de passe") ||
    lower.includes("compte suspendu") ||
    lower.includes("connexion") ||
    lower.includes("identifiants") ||
    lower.includes("code de sécurité") ||
    lower.includes("confirmez votre compte")
  ) {
    score += 3;
    alerts.push("Le message évoque des informations sensibles.");
  }

  if (
    lower.includes("colis") ||
    lower.includes("livraison") ||
    lower.includes("amende") ||
    lower.includes("banque") ||
    lower.includes("cpf") ||
    lower.includes("assurance maladie") ||
    lower.includes("carte vitale")
  ) {
    score += 2;
    alerts.push("Le message ressemble à un scénario d’arnaque courant.");
  }

  if (
    lower.includes("félicitations") ||
    lower.includes("vous avez gagné") ||
    lower.includes("cadeau") ||
    lower.includes("récompense")
  ) {
    score += 2;
    alerts.push("Le message utilise une promesse de gain ou de récompense.");
  }

  if (/[^\x00-\x7F]/.test(text) && /[а-яА-Я]/.test(text)) {
    score += 3;
    alerts.push("Le message contient des caractères inhabituels pouvant imiter des lettres classiques.");
  }

  const finalScore = Math.min(score, 10);

  if (finalScore <= 2) {
    return {
      risk: "Faible",
      color: "emerald",
      score: finalScore,
      alerts: alerts.length ? alerts : ["Aucun signal critique détecté."],
      recommendation: "Le contenu semble relativement sûr, mais restez vigilant.",
    };
  }

  if (finalScore <= 5) {
    return {
      risk: "Moyen",
      color: "yellow",
      score: finalScore,
      alerts,
      recommendation: "Vérifiez l’expéditeur et évitez de cliquer trop rapidement.",
    };
  }

  return {
    risk: "Élevé",
    color: "red",
    score: finalScore,
    alerts,
    recommendation:
      "Ne cliquez pas directement. Vérifiez l’information depuis le site officiel ou un canal connu.",
  };
}