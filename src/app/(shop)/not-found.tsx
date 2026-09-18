import { NotFoundContent } from "@/components/shop/not-found-content";

/** 404 inside the storefront chrome (notFound() from shop pages). Next adds noindex automatically. */
export default function ShopNotFound() {
  return <NotFoundContent />;
}
