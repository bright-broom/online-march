"use client";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

/** Password field with a show/hide toggle. */
export function PasswordInput(props: Omit<React.ComponentProps<typeof InputGroupInput>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup className="h-11">
      <InputGroupAddon>
        <LockKeyhole />
      </InputGroupAddon>
      <InputGroupInput type={visible ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? "パスワードを隠す" : "パスワードを表示"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
