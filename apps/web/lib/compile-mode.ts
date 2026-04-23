export function shouldUseAsyncCompileByDefault(params?: {
  apiUrl?: string | null;
  envValue?: string | null;
}) {
  const envValue = params?.envValue?.trim().toLowerCase() ?? "";

  if (envValue === "true") {
    return true;
  }

  return true;
}
