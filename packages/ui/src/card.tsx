import { type JSX } from "react";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className={className}>
      {children}
    </div>
  );
}
