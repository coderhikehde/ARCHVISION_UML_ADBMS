import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "accent" | "success" | "error" | "warning" | "outline" | "soft-blue";
}

const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-primary/10 text-primary",
  accent: "bg-accent-soft text-teal-900",
  success: "bg-emerald-50 text-success",
  error: "bg-red-50 text-error",
  warning: "bg-orange-50 text-orange-700",
  outline: "border border-line text-muted",
  "soft-blue": "bg-primary-50 text-primary-deep",
};

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <span ref={ref} className={cn("tag", variants[variant], className)} {...props} />
  )
);
Badge.displayName = "Badge";

export { Badge };