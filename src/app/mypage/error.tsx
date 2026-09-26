"use client";
import { AreaError } from "@/components/common/area-error";
import { routes } from "@/config/nav";

export default function MypageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <AreaError error={error} retry={retry} homeHref={routes.mypage.root} homeLabel="マイページのトップへ" />;
}
