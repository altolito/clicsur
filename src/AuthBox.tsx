import { useState } from "react";
import { supabase } from "./lib/supabase";

export default function AuthBox() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSignUp() {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Compte créé. Vérifie ton email pour confirmer l'inscription.");
  }

  async function handleSignIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4 mb-6 space-y-3">
      <h2 className="text-lg font-semibold">Connexion</h2>
      <p className="text-sm text-slate-500">
        Connectez-vous pour retrouver votre historique personnel.
      </p>

      <input
        type="email"
        placeholder="Email"
        className="w-full rounded-lg border px-3 py-2"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <input
        type="password"
        placeholder="Mot de passe"
        className="w-full rounded-lg border px-3 py-2"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <div className="flex gap-2">
        <button
          onClick={handleSignIn}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white"
        >
          Se connecter
        </button>

        <button
          onClick={handleSignUp}
          className="rounded-lg border px-4 py-2"
        >
          Créer un compte
        </button>
      </div>
    </div>
  );
}