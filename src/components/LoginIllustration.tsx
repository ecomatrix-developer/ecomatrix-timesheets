"use client";

import { motion } from "framer-motion";
import { Lottie } from "lottie-react";
import Image from "next/image";

// Same LottieFiles animation v1's login page used, loaded via a
// <lottie-player> web component pointed at this exact hosted JSON URL.
// v2 renders it with `lottie-react` instead (a proper React component, no
// extra <script> tag needed) but points at the identical source file, so
// the animation itself is unchanged from v1. `lottie-react`'s `src` prop
// accepts a URL directly and handles fetching/loading internally.
const LOTTIE_SRC =
  "https://assets6.lottiefiles.com/packages/lf20_3rwasyjy.json";

export default function LoginIllustration() {
  return (
    <div className="relative flex flex-col items-center justify-center h-full px-8 py-10 text-center bg-[#f8fafc]">
      <motion.div
        className="relative w-full max-w-xs"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <Lottie src={LOTTIE_SRC} loop autoplay className="w-full h-[300px]" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative mt-3"
      >
        <div className="relative w-64 h-16 mx-auto">
          <Image src="/logo.png" alt="Eco Matrix Engineering" fill className="object-contain" sizes="256px" priority />
        </div>
        <p className="mt-2 text-sm text-[#a0aec0] italic font-mono">
          Bringing order to your office hours....
        </p>
      </motion.div>
    </div>
  );
}
