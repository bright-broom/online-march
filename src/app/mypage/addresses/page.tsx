import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { AddressBook } from "@/components/mypage/address-book";
import { routes } from "@/config/nav";
import { requireRole } from "@/server/auth/guards";
import { listAddresses } from "@/server/queries/account";

export const metadata: Metadata = { title: "お届け先" };

export default async function AddressesPage() {
  const user = await requireRole("customer", routes.mypage.addresses);
  const addresses = await listAddresses(user.id);
  return (
    <>
      <PageHeader title="お届け先" description="ご自宅やギフトの送り先を登録できます。" />
      <AddressBook addresses={addresses} />
    </>
  );
}
