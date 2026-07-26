import { supabaseServer } from "@/lib/supabase-server";

type AdminAuthSuccess = {
  success: true;
  user: {
    id: string;
    email: string;
  };
  role: "admin";
};

type AdminAuthFailure = {
  success: false;
  status: number;
  error: string;
};

export type AdminAuthResult =
  | AdminAuthSuccess
  | AdminAuthFailure;

/**
 * Récupère la liste des courriels administrateurs configurés
 * dans ADMIN_EMAILS ou ADMIN_EMAIL.
 *
 * Formats acceptés :
 * ADMIN_EMAIL=admin@exemple.com
 *
 * ADMIN_EMAILS=admin@exemple.com,autre@exemple.com
 *
 * Les séparateurs acceptés sont :
 * - virgule
 * - point-virgule
 * - retour à la ligne
 */
function getAuthorizedAdminEmails(): string[] {
  const configuredEmails =
    process.env.ADMIN_EMAILS?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "";

  if (!configuredEmails) {
    return [];
  }

  return Array.from(
    new Set(
      configuredEmails
        .split(/[,;\n\r]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

/**
 * Vérifie qu'une requête provient d'un utilisateur Supabase
 * authentifié et dont le courriel fait partie des administrateurs.
 */
export async function requireAdmin(
  request: Request
): Promise<AdminAuthResult> {
  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      success: false,
      status: 401,
      error: "Authentification requise.",
    };
  }

  const accessToken = authorization
    .slice("Bearer ".length)
    .trim();

  if (!accessToken) {
    return {
      success: false,
      status: 401,
      error: "Jeton d’authentification manquant.",
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseServer.auth.getUser(accessToken);

  if (userError || !user) {
    console.error(
      "Erreur de vérification de la session administrateur :",
      userError
    );

    return {
      success: false,
      status: 401,
      error:
        "Session invalide ou expirée. Veuillez vous reconnecter.",
    };
  }

  const email = user.email?.trim().toLowerCase();

  if (!email) {
    return {
      success: false,
      status: 403,
      error:
        "Aucune adresse courriel n’est associée à ce compte.",
    };
  }

  const authorizedEmails =
    getAuthorizedAdminEmails();

  if (authorizedEmails.length === 0) {
    console.error(
      "Configuration administrateur manquante : ajoutez ADMIN_EMAILS ou ADMIN_EMAIL dans .env.local."
    );

    return {
      success: false,
      status: 500,
      error:
        "La liste des administrateurs n’est pas configurée.",
    };
  }

  if (!authorizedEmails.includes(email)) {
    console.warn(
      `Accès administrateur refusé pour le compte : ${email}`
    );

    return {
      success: false,
      status: 403,
      error:
        "Ce compte n’est pas autorisé à accéder à l’administration.",
    };
  }

  return {
    success: true,
    user: {
      id: user.id,
      email,
    },
    role: "admin",
  };
}