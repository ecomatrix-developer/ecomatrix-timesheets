"use client";

import {
  FaProjectDiagram,
  FaTasks,
  FaCheckCircle,
  FaSyncAlt,
  FaArchive,
} from "react-icons/fa";
import type { IconType } from "react-icons";
import GlassCard from "@/components/GlassCard";
import CountUpStat from "@/components/CountUpStat";

const STAT_CONFIG: { key: string; label: string; color: string; Icon: IconType }[] = [
  { key: "active", label: "Active Projects", color: "#28a745", Icon: FaTasks },
  { key: "completed", label: "Completed Projects", color: "#0d6efd", Icon: FaCheckCircle },
  { key: "re-work", label: "Re-work Projects", color: "#ffc107", Icon: FaSyncAlt },
  { key: "archived", label: "Archived Projects", color: "#dc3545", Icon: FaArchive },
];

export default function DashboardStats({
  counts,
  total,
}: {
  counts: Record<string, number>;
  total: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <GlassCard
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        whileHover={{ y: -4 }}
        className="relative overflow-hidden flex items-center justify-between p-4"
      >
        <CountUpStat value={total} label="Total Projects" accent="#667eea" />
        <FaProjectDiagram className="h-7 w-7 text-gray-300 shrink-0 ml-2" />
      </GlassCard>

      {STAT_CONFIG.map((stat, i) => (
        <GlassCard
          key={stat.key}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (i + 1) * 0.08, duration: 0.4 }}
          whileHover={{ y: -4 }}
          className="relative overflow-hidden flex items-center justify-between p-4"
        >
          <CountUpStat
            value={counts[stat.key] ?? 0}
            label={stat.label}
            accent={stat.color}
          />
          <stat.Icon className="h-7 w-7 text-gray-300 shrink-0 ml-2" />
        </GlassCard>
      ))}
    </div>
  );
}
