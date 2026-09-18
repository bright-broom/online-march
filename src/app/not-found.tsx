import { Logo } from "@/components/common/logo";
import { NotFoundContent } from "@/components/shop/not-found-content";

/** Root 404 (URLs outside any route group). Minimal brand chrome; no request-time data. */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="container-page flex h-16 items-center">
        <Logo />
      </header>
      <NotFoundContent />
    </div>
  );
}
