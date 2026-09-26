import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PayoutStatementDocument, statementPrintCss } from "@/components/farmer/payouts/payout-statement";
import { PrintToolbar } from "@/components/farmer/slip/print-toolbar";
import { routes } from "@/config/nav";
import { requireFarm } from "@/server/auth/guards";
import { getPayoutStatement } from "@/server/queries/farmer";

export const metadata: Metadata = { title: "支払通知書" };

/** 支払通知書（#10）。精算はオーナーだけ（"money"）。自分の農園の精算だけ（getPayoutStatement が farmId で絞る） */
export default async function PayoutStatementPage({ params }: PageProps<"/farmer/payouts/[id]/statement">) {
  const { id } = await params;
  const { farm } = await requireFarm("money");
  const statement = /^[0-9a-f-]{36}$/i.test(id) ? await getPayoutStatement(farm.id, id) : null;
  if (!statement) notFound();
  await connection();
  return (
    <div className="print:m-0">
      <style>{statementPrintCss}</style>
      <PrintToolbar count={1} backHref={routes.farmer.payouts} label="支払通知書（A4・印刷画面で PDF に保存できます）" />
      <PayoutStatementDocument statement={statement} farm={farm} issuedAt={new Date()} />
    </div>
  );
}
