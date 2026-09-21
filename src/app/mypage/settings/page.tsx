import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { CloseAccountButton } from "@/components/mypage/close-account-button";
import { PasswordForm } from "@/components/mypage/password-form";
import { ProfileForm } from "@/components/mypage/profile-form";
import { SignOutButton } from "@/components/mypage/sign-out-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/config/nav";
import { formatDate } from "@/lib/format";
import { requireRole } from "@/server/auth/guards";
import { getProfile } from "@/server/queries/account";

export const metadata: Metadata = { title: "アカウント設定" };

export default async function SettingsPage() {
  const user = await requireRole("customer", routes.mypage.settings);
  const profile = await getProfile(user.id);
  if (!profile) notFound();
  return (
    <>
      <PageHeader title="アカウント設定" description={`${formatDate(profile.createdAt)} からご利用いただいています。`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>プロフィール</CardTitle>
            <CardDescription>お名前は生産者とのメッセージや領収書の宛名に使われます。</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm name={profile.name} phone={profile.phone} email={profile.email} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>パスワード</CardTitle>
            <CardDescription>変更すると、ほかの端末からは自動的にログアウトされます。</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>お届け先</CardTitle>
            <CardDescription>ご自宅やギフトの送り先はアドレス帳で管理できます。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="rounded-full">
              <Link href={routes.mypage.addresses}><MapPin />アドレス帳を開く</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>ログアウト</CardTitle>
            <CardDescription>共有の端末をお使いの場合は、ご利用後にログアウトしてください。</CardDescription>
          </CardHeader>
          <CardContent>
            <SignOutButton />
          </CardContent>
        </Card>
        <Card className="border-destructive/30 lg:col-span-2">
          <CardHeader>
            <CardTitle>退会</CardTitle>
            <CardDescription>
              アカウントと個人情報を削除します。ご注文の記録は帳簿・配送の記録として法令に従い保管します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CloseAccountButton email={profile.email} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
