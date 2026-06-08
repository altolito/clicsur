import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "./lib/supabase";

export default function AuthBox() {
  return (
    <div className="auth-box">
      <h2>Connexion</h2>
      <p>Connectez-vous pour retrouver votre historique personnel.</p>

      <Auth
        supabaseClient={supabase}
        appearance={{ theme: ThemeSupa }}
        providers={[]}
        localization={{
          variables: {
            sign_in: {
              email_label: "Email",
              password_label: "Mot de passe",
              button_label: "Se connecter",
              loading_button_label: "Connexion...",
              link_text: "Déjà inscrit ? Connectez-vous",
            },
            sign_up: {
              email_label: "Email",
              password_label: "Mot de passe",
              button_label: "Créer un compte",
              loading_button_label: "Création du compte...",
              link_text: "Pas encore de compte ? Inscrivez-vous",
            },
          },
        }}
      />
    </div>
  );
}