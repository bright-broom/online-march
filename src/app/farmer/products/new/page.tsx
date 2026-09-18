import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductForm } from "@/components/farmer/products/product-form";
import { requireFarm } from "@/server/auth/guards";

export const metadata: Metadata = { title: "商品を登録" };

export default async function NewProductPage() {
  const { farm } = await requireFarm();
  return (
    <div>
      <PageHeader title="商品を登録" description="写真・規格・説明を入力して「保存」。下書きで保存して、あとから公開することもできます。" />
      <ProductForm farm={{ name: farm.name, avatarImage: farm.avatarImage }} />
    </div>
  );
}
