interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
      renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

let sdkPromise: Promise<void> | null = null;

function loadGoogleSdk() {
  sdkPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in could not be loaded."));
    document.head.append(script);
  });
  return sdkPromise;
}

interface Options {
  apiUrl: string;
  onSession: (token: string) => Promise<void> | void;
  onError: (message: string) => void;
}

// Shows "Sign in with Google" inside the container when the Worker has a Google client ID configured.
export async function mountGoogleSignIn(container: HTMLElement | null, { apiUrl, onSession, onError }: Options) {
  if (!container || !apiUrl) return;
  try {
    const config = await fetch(`${apiUrl}/auth/google-config`, { headers: { Accept: "application/json" }, credentials: "omit" });
    if (!config.ok) return;
    const { clientId } = (await config.json()) as { clientId?: unknown };
    if (typeof clientId !== "string" || !clientId) return;
    await loadGoogleSdk();
    const google = (window as unknown as { google?: GoogleIdentity }).google;
    if (!google) return;
    google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        if (!credential) return;
        try {
          const response = await fetch(`${apiUrl}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "omit",
            body: JSON.stringify({ credential }),
          });
          const result = (await response.json().catch(() => ({}))) as { token?: unknown; error?: unknown };
          if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Google sign-in failed.");
          if (typeof result.token !== "string" || !/^[0-9a-f]{64}$/.test(result.token)) {
            throw new Error("Sign-in returned an invalid session. Please try again.");
          }
          await onSession(result.token);
        } catch (error) {
          onError(error instanceof Error ? error.message : "Google sign-in failed.");
        }
      },
    });
    const button = document.createElement("div");
    google.accounts.id.renderButton(button, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 280 });
    const divider = document.createElement("p");
    divider.className = "google-signin-divider";
    divider.textContent = "or use your email";
    container.replaceChildren(button, divider);
    container.hidden = false;
  } catch {
    // The email code sign-in keeps working if Google is unavailable.
  }
}
