import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { fmtNumber } from "@/lib/format";

export default function KPICard({
  label,
  value,
  suffix,
  trend,
  hint,
  icon: Icon,
  variant = "dark",
  index = 0,
  testid,
}) {
  const isDark = variant === "dark";
  const trendIcon =
    trend === undefined || trend === null ? null : trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;
  const TrendIcon = trendIcon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: "easeOut" }}
      whileHover={{ y: -3 }}
      className={`relative overflow-hidden rounded-3xl p-6 ${
        isDark
          ? "panel-dark shadow-panel-deep"
          : "bg-white border border-lime-900/10 shadow-soft-lg"
      }`}
      data-testid={testid}
    >
      {isDark && <div className="grain absolute inset-0 opacity-30" />}
      <div className="relative z-10 flex items-start justify-between">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-lime-300/80">
          {isDark ? label : <span className="text-forest-700/70">{label}</span>}
        </div>
        {Icon && (
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              isDark ? "bg-lime-500/15 border border-lime-400/20" : "bg-lime-50 border border-lime-200/70"
            }`}
          >
            <Icon className={isDark ? "w-4 h-4 text-lime-300" : "w-4 h-4 text-forest-800"} strokeWidth={1.75} />
          </div>
        )}
      </div>
      <div className="relative z-10 mt-6 flex items-baseline gap-1">
        <span
          className={`font-display font-semibold leading-none tracking-tight text-[42px] ${
            isDark ? "text-white" : "text-forest-950"
          }`}
        >
          {typeof value === "number" ? fmtNumber(value) : value}
        </span>
        {suffix && (
          <span
            className={`font-display text-lg ${isDark ? "text-lime-300" : "text-forest-700"}`}
          >
            {suffix}
          </span>
        )}
      </div>
      <div className="relative z-10 mt-3 flex items-center gap-2">
        {TrendIcon && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              trend > 0
                ? "bg-lime-500/20 text-lime-300"
                : trend < 0
                ? "bg-red-500/15 text-red-300"
                : "bg-slate-500/15 text-slate-300"
            }`}
          >
            <TrendIcon className="w-3 h-3" />
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
        )}
        {hint && (
          <span className={`text-xs ${isDark ? "text-lime-200/70" : "text-forest-700/70"}`}>
            {hint}
          </span>
        )}
      </div>
    </motion.div>
  );
}
