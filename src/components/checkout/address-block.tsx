import { formatPostalCode } from "@/lib/format";
import { cn } from "@/lib/utils";

type AddressLike = {
  recipientName: string;
  recipientKana?: string | null;
  postalCode: string;
  prefecture: string;
  city: string;
  line1: string;
  line2?: string | null;
  phone: string;
};

/** Read-only address (checkout cards, order detail snapshot, address book). */
export function AddressBlock({ address, className, compact = false }: { address: AddressLike; className?: string; compact?: boolean }) {
  return (
    <div className={cn("text-sm leading-relaxed", className)}>
      <p className="font-medium">
        {address.recipientName} 様
        {address.recipientKana && !compact && <span className="text-muted-foreground ml-2 text-xs font-normal">{address.recipientKana}</span>}
      </p>
      <p className="text-muted-foreground">
        〒{formatPostalCode(address.postalCode)} {address.prefecture}
        {address.city}
        {address.line1}
        {address.line2 ? ` ${address.line2}` : ""}
      </p>
      {!compact && <p className="text-muted-foreground num text-xs">TEL {address.phone}</p>}
    </div>
  );
}
