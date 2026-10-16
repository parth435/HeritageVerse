import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-12 w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-sm text-parchment placeholder:text-parchment/40 outline-none focus-visible:border-gold/70 focus-visible:ring-2 focus-visible:ring-gold/40",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
