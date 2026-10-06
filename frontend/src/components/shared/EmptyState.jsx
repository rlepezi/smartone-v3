import React from "react";
import { Inbox } from "lucide-react";

export const EmptyState = ({ icon: Icon = Inbox, message }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
      <Icon className="w-5 h-5" />
      <span className="text-xs">{message}</span>
    </div>
  );
};
