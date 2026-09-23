import { redirect } from "next/navigation";

export default async function BuyPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === "string") {
      search.set(key, val);
    } else if (Array.isArray(val)) {
      val.forEach((v) => search.append(key, v));
    }
  }
  const qs = search.toString();
  redirect(qs ? `/dashboard?${qs}` : "/dashboard");
}
