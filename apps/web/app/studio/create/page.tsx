import { redirect } from "next/navigation";

export default async function CreatePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams ?? {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }

  redirect(`/studio/create-v3${params.size > 0 ? `?${params.toString()}` : ""}`);
}
