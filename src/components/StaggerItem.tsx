import React, { type CSSProperties, type ReactNode } from "react";

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
}

export default function StaggerItem({
  children,
  className = "",
  delay = 0,
  style,
}: StaggerItemProps) {
  return (
    <div
      className={`animate-fade-up ${className}`}
      style={{
        ...style,
        animationDelay: `${delay}ms`,
        animationFillMode: "both",
      }}
    >
      {children}
    </div>
  );
}
