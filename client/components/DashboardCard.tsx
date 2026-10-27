import { ReactNode } from "react";

interface DashboardCardProps {
  id?: string;
  title: string;
  value?: string | number;
  icon?: ReactNode;
  description?: string;
  trend?: string;
  children?: ReactNode;
  className?: string;
}

export default function DashboardCard({
  id,
  title,
  value,
  icon,
  description,
  trend,
  children,
  className = "",
}: DashboardCardProps) {
  return (
    <section
      id={id}
      className={`rounded-2xl border border-white/10 bg-white/[0.08] p-5 shadow-xl shadow-slate-950/20 backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:bg-white/[0.11] ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-300">{title}</p>
          {value !== undefined && (
            <p className="mt-2 font-sora text-3xl font-bold text-white">
              {value}
            </p>
          )}
          {description && (
            <p className="mt-2 text-sm leading-5 text-slate-400">
              {description}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-950/30">
            {icon}
          </div>
        )}
      </div>

      {trend && (
        <p className="mt-4 inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
          {trend}
        </p>
      )}

      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}
