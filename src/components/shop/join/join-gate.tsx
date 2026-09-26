import { Check, Clock3, LayoutDashboard, LogIn, RotateCcw, UserPlus } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { joinContent } from "@/config/content";
import { roleHome, routes } from "@/config/nav";
import { isRejectedApplication } from "@/lib/farms";
import { formatDate } from "@/lib/format";
import { getSessionUser } from "@/server/auth/session";
import { getFarmApplication } from "@/server/queries/catalog";
import { JoinForm } from "./join-form";

function Notice({ icon: IconC, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-paper flex flex-col items-center gap-4 rounded-3xl px-6 py-12 text-center">
      <span className="bg-background text-primary flex size-12 items-center justify-center rounded-full">
        <IconC className="size-5" />
      </span>
      <h3 className="heading-display text-xl">{title}</h3>
      {children}
    </div>
  );
}

/** Request-time: decides between guest CTA / farmer note / pending status / rejected (re-apply) / the form. Render inside <Suspense>. */
export async function JoinGate() {
  const user = await getSessionUser();
  const next = encodeURIComponent(routes.join);

  if (!user) {
    return (
      <Notice icon={UserPlus} title="まずはアカウントを作成してください">
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          出店申請には無料の会員登録が必要です。登録後、このページに戻って農園情報を入力してください。
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild className="h-11 rounded-full px-6">
            <Link href={`${routes.signup}?next=${next}`}>
              <UserPlus />
              会員登録して申請する
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-full px-6">
            <Link href={`${routes.login}?next=${next}`}>
              <LogIn />
              ログイン
            </Link>
          </Button>
        </div>
      </Notice>
    );
  }

  if (user.role !== "customer") {
    return (
      <Notice icon={LayoutDashboard} title={user.role === "farmer" ? "すでに出店されています" : "運営アカウントでログイン中です"}>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          出店申請は購入者アカウントから行えます。{user.role === "farmer" && "商品の登録や出荷はダッシュボードから行えます。"}
        </p>
        <Button asChild variant="outline" className="h-11 rounded-full px-6">
          <Link href={roleHome[user.role]}>ダッシュボードへ</Link>
        </Button>
      </Notice>
    );
  }

  const application = await getFarmApplication(user.id);
  if (application && isRejectedApplication(application)) {
    return (
      <div className="space-y-8">
        <Notice icon={RotateCcw} title={joinContent.rejected.title}>
          <p className="text-muted-foreground max-w-md text-sm leading-relaxed">{joinContent.rejected.lead}</p>
          <Button asChild variant="outline" className="h-11 rounded-full px-6">
            <Link href={routes.mypage.notifications}>お知らせを見る</Link>
          </Button>
        </Notice>
        <JoinForm defaults={{ ...application, farmName: application.name }} />
      </div>
    );
  }
  if (application) {
    return (
      <Notice icon={Clock3} title={`「${application.name}」の申請を受け付けています`}>
        <StatusBadge kind="farm" status={application.status} />
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          {formatDate(application.createdAt)}に申請いただきました。{joinContent.pending.lead}
        </p>
        <div className="bg-background w-full max-w-md rounded-2xl p-5 text-left">
          <p className="text-sm font-medium">{joinContent.pending.prepareTitle}</p>
          <ul className="text-muted-foreground mt-3 space-y-2 text-sm leading-relaxed">
            {joinContent.pending.prepare.map((item) => (
              <li key={item} className="flex gap-2">
                <Check className="text-leaf mt-0.5 size-4 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <Button asChild variant="outline" className="h-11 rounded-full px-6">
          <Link href={routes.mypage.notifications}>お知らせを見る</Link>
        </Button>
      </Notice>
    );
  }

  return <JoinForm defaults={{ representative: user.name }} />;
}

export function JoinGateSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-40" />
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-36 rounded-xl" />
    </div>
  );
}
