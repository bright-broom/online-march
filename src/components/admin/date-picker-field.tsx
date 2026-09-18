"use client";
import { CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { ja } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fromYmd } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Local-calendar date → "YYYY-MM-DD" (the business date the admin clicked). */
const toYmdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromYmdLocal = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Popover calendar posting a YYYY-MM-DD value (JST business date) through a hidden input. */
export function DatePickerField({
  name,
  label,
  defaultValue,
  placeholder = "未設定",
  errors,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  placeholder?: string;
  errors?: { message?: string }[];
}) {
  const [value, setValue] = useState<string>(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  return (
    <Field data-invalid={Boolean(errors?.length)}>
      <FieldLabel>{label}</FieldLabel>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className={cn("flex-1 justify-start font-normal", !value && "text-muted-foreground")}>
              <CalendarIcon />
              {value ? formatDate(fromYmd(value)) : placeholder}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={ja}
              selected={value ? fromYmdLocal(value) : undefined}
              defaultMonth={value ? fromYmdLocal(value) : undefined}
              onSelect={(d) => {
                setValue(d ? toYmdLocal(d) : "");
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        {value && (
          <Button type="button" variant="ghost" size="icon" aria-label={`${label}をクリア`} onClick={() => setValue("")}>
            <X />
          </Button>
        )}
      </div>
      <FieldError errors={errors} />
    </Field>
  );
}
