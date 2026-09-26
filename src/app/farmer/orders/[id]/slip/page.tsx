import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PrintToolbar } from "@/components/farmer/slip/print-toolbar";
import { SlipDocument, slipPrintCss } from "@/components/farmer/slip/slip-document";
import { routes } from "@/config/nav";
import { requireFarm } from "@/server/auth/guards";
import { getFarmOrdersForSlip } from "@/server/queries/farmer";

export const metadata: Metadata = { title: "納品書" };

const uuid = /^[0-9a-f-]{36}$/i;

/** Printable 納品書. `?ids=a,b,c` prints several (bulk from 出荷センター); `?print=1` opens the print dialog. */
export default async function SlipPage({ params, searchParams }: PageProps<"/farmer/orders/[id]/slip">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { farm } = await requireFarm("ship");
  const extra = typeof sp.ids === "string" ? sp.ids.split(",") : [];
  const ids = [...new Set([id, ...extra])].filter((x) => uuid.test(x)).slice(0, 200);
  const orders = await getFarmOrdersForSlip(farm.id, ids);
  if (!orders.length) notFound();
  await connection();
  const issuedAt = new Date();
  const bulk = orders.length > 1;

  return (
    <div className="print:m-0">
      <style>{slipPrintCss}</style>
      <PrintToolbar count={orders.length} backHref={bulk ? routes.farmer.shipping : routes.farmer.order(orders[0].id)} autoPrint={sp.print === "1"} />
      {orders.map((fo) => (
        <SlipDocument key={fo.id} fo={fo} farm={farm} issuedAt={issuedAt} />
      ))}
    </div>
  );
}
