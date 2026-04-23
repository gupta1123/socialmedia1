const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function resolveHostname(apiUrl: string) {
  try {
    return new URL(apiUrl).hostname.toLowerCase();
  } catch {
    return apiUrl.trim().toLowerCase();
  }
}

export function shouldUseAsyncCompileByDefault(params?: {
  apiUrl?: string | null;
  envValue?: string | null;
}) {
  const apiUrl = params?.apiUrl?.trim() ?? "";
  const envValue = params?.envValue?.trim().toLowerCase() ?? "";

  if (envValue === "true") {
    return true;
  }

  if (!apiUrl) {
    return false;
  }

  return !LOCAL_API_HOSTS.has(resolveHostname(apiUrl));
}
