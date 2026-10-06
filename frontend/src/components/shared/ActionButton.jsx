import React from "react";
import { cn } from "../../utils/cn";

const VARIANTES = {
  neutral: "border-slate-200 bg-white hover:bg-slate-50 text-slate-600",
  primary: "border-primary/20 bg-primary-lighter hover:bg-primary/10 text-primary",
};

export const ActionButton = ({
  variant = "neutral",
  icon: Icon,
  busy = false,
  busyLabel,
  children,
  onClick,
  disabled,
  as: Component = "button",
  to,
  className,
  ...rest
}) => {
  const shellClassName = cn(
    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors",
    VARIANTES[variant] || VARIANTES.neutral,
    Component === "button" && "disabled:opacity-50",
    className,
  );
  const content = busy && busyLabel ? busyLabel : children;

  if (Component !== "button") {
    return (
      <Component to={to} className={shellClassName} {...rest}>
        {Icon && <Icon className="w-3 h-3" />}
        {content}
      </Component>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled ?? busy}
      className={shellClassName}
      {...rest}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {content}
    </button>
  );
};
