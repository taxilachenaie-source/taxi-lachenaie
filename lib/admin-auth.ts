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

function getAuthorizedAdminEmails(): string[] {
  const configuredEmails =
    process.env.ADMIN_EMAILS ||
    process.env.ADMIN_EMAIL ||
    "";

  return configuredEmails
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdmin(
  request: Request
): Promise<AdminAuthResult> {
    console.log("ADMIN_EMAILS =", process.env.ADMIN_EMAILS);
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
    return {
      success: false,
      status: 401,
      error: "Session invalide ou expirée.",
    };
  }

  const email = user.email?.trim().toLowerCase();

  if (!email) {
    return {
      success: false,
      status: 403,
      error: "Adresse courriel utilisateur introuvable.",
    };
  }

  const authorizedEmails = getAuthorizedAdminEmails();

  if (authorizedEmails.length === 0) {
    console.error(
      "ADMIN_EMAILS ou ADMIN_EMAIL n’est pas configuré."
    );

    return {
      success: false,
      status: 500,
      error:
        "La liste des administrateurs n’est pas configurée.",
    };
  }

  if (!authorizedEmails.includes(email)) {
    return {
      success: false,
      status: 403,
      error: "Accès administrateur refusé.",
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