"use client";
import { AreaError } from "@/components/common/area-error";
import { routes } from "@/config/nav";

export default function FarmerError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <AreaError error={error} retry={retry} homeHref={routes.farmer.root} homeLabel="生産者のトップへ" />;
}
