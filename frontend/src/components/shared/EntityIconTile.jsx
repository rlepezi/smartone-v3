import React from "react";

export const EntityIconTile = ({ icon: Icon }) => {
  return (
    <div className="w-9 h-9 rounded-xl bg-primary-lighter text-primary flex items-center justify-center flex-shrink-0 font-bold">
      <Icon className="w-4 h-4" />
    </div>
  );
};
