"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import clsx from "clsx";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  strong?: boolean;
  className?: string;
}

export default function GlassCard({
  strong,
  className,
  children,
  ...rest
}: GlassCardProps) {
  return (
    <motion.div
      className={clsx(strong ? "glass-strong" : "glass", "p-5", className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
