"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/nav";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      className="rounded-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await signOut();
          router.push(routes.home);
          router.refresh();
        })
      }
    >
      {pending ? <Spinner /> : <LogOut />}ログアウト
    </Button>
  );
}
