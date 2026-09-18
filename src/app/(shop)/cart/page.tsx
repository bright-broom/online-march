import type { Metadata } from "next";
import { CartContents } from "@/components/shop/cart/cart-contents";
import { PageIntro } from "@/components/shop/page-intro";

export const metadata: Metadata = {
  title: "カート",
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <>
      <PageIntro
        crumbs={[{ label: "カート" }]}
        eyebrow="CART"
        title="カート"
        lead="農家さんごとに箱詰めして直送します。送料・お届け日はお届け先の都道府県で試算できます。"
      />
      <div className="container-page pb-20 sm:pb-28">
        <CartContents variant="page" />
      </div>
    </>
  );
}
