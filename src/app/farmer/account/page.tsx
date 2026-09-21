import { LifeBuoy, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PasswordForm } from "@/components/account/password-form";
import { ProfileForm } from "@/components/account/profile-form";
import { SignOutButton } from "@/components/account/sign-out-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/config/nav";
import { siteConfig } from "@/config/site";
import { formatDate } from "@/lib/format";
import { requireFarm } from "@/server/auth/guards";
import { getProfile } from "@/server/queries/account";

export const metadata: Metadata = { title: "アカウント" };

export default async function FarmerAccountPage() {
  const { user, farm } = await requireFarm();
  const profile = await getProfile(user.id);
  if (!profile) notFound();

  return (
    <div>
      <PageHeader title="アカウント" description={`${farm.name}｜${formatDate(profile.createdAt)} から出店いただいています。`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ご担当者の情報</CardTitle>
            <CardDescription>お名前はお客さまとのメッセージに表示されます。農園名や住所は「ショップページ」で変更できます。</CardDescription>
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
            <CardTitle>農園の情報</CardTitle>
            <CardDescription>農園名・写真・紹介文・所在地はショップページから編集します。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="rounded-full">
              <Link href={routes.farmer.shop}><Store />ショップページを編集</Link>
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
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>出店の休止・退店</CardTitle>
            <CardDescription>
              配送中のご注文と精算が残るため、生産者アカウントはご自身では削除できません。休止・退店をご希望の場合は運営までご連絡ください。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="rounded-full">
              <a href={`mailto:${siteConfig.contact.email}`}><LifeBuoy />運営に相談する</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
