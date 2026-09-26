import { LogIn, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AcceptStaffInvite } from "@/components/shop/join/accept-staff-invite";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { farmAccessMeta, farmStaffCopy } from "@/config/farm-staff";
import { routes } from "@/config/nav";
import { formatDate } from "@/lib/format";
import { getSessionUser } from "@/server/auth/session";
import { getFarmInvite } from "@/server/queries/farmer";

// 招待リンクは本人だけのもの。検索にも出さない
export const metadata: Metadata = { title: "スタッフへの招待", robots: { index: false, follow: false } };

/** 農園スタッフの招待リンク（#24）。招待されたアドレスのアカウントでログインして参加する */
export default function StaffInvitePage({ params }: PageProps<"/join/staff/[token]">) {
  return (
    <section className="container-page flex justify-center py-16 sm:py-24">
      <div className="bg-paper w-full max-w-lg space-y-5 rounded-3xl px-6 py-10 text-center">
        <span className="bg-background text-primary mx-auto flex size-12 items-center justify-center rounded-full">
          <Users className="size-5" />
        </span>
        <Suspense fallback={<Skeleton className="mx-auto h-24 w-full max-w-sm" />}>
          <InviteGate params={params} />
        </Suspense>
      </div>
    </section>
  );
}

async function InviteGate({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connection();
  const found = /^[A-Za-z0-9_-]{43}$/.test(token) ? await getFarmInvite(token, new Date()) : { error: farmStaffCopy.errors.invalidInvite };
  if (!found.invite) {
    return (
      <>
        <h1 className="heading-display text-xl">招待を確認できません</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{found.error}</p>
      </>
    );
  }
  const inv = found.invite;
  const user = await getSessionUser();
  const next = encodeURIComponent(routes.staffInvite(token));
  return (
    <>
      <h1 className="heading-display text-xl">「{inv.farmName}」のスタッフに招待されています</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">
        権限：{farmAccessMeta[inv.access].label}（{farmAccessMeta[inv.access].description}）
        <br />
        招待先：{inv.email}・{formatDate(inv.expiresAt)} まで有効
      </p>
      {user ? (
        user.email.toLowerCase() === inv.email ? (
          <AcceptStaffInvite token={token} />
        ) : (
          <p className="text-destructive text-sm">{farmStaffCopy.errors.wrongAccount}（いまは {user.email} でログインしています）</p>
        )
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild className="h-11 rounded-full px-6">
            <Link href={`${routes.signup}?next=${next}`}><UserPlus />会員登録して参加する</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-full px-6">
            <Link href={`${routes.login}?next=${next}`}><LogIn />ログイン</Link>
          </Button>
        </div>
      )}
    </>
  );
}
