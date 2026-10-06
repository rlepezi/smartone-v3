import React from "react";
import { AlertCircle } from "lucide-react";

export const ErrorBanner = ({ message }) => {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
};
