"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { motion } from "framer-motion";
import { loginAction, type LoginState } from "@/app/(actions)/authActions";
import Modal from "@/components/Modal";

const initialState: LoginState = {};

/**
 * Mirrors v1's login.html "Forgot Password?" modal exactly: there is no
 * real backend reset flow (v1's app.py has no matching route either) —
 * submitting always just shows a message directing the user to contact
 * an admin/developer.
 */
function ForgotPasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  const [username, setUsername] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        setSubmitted(false);
        setUsername("");
      }}
      title="Request Password Reset"
    >
      <p className="text-sm text-muted mb-4">
        Enter your username below to request a password reset.
      </p>
      {submitted && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          Please contact the developer or your admin to reset your password.
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block" htmlFor="resetUsername">
            Username
          </label>
          <input
            id="resetUsername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="glass-input w-full px-3 py-2"
          />
        </div>
        <button type="submit" className="btn-primary w-full py-2">
          Send Reset Request
        </button>
      </form>
    </Modal>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      type="submit"
      disabled={pending}
      className="btn-primary w-full py-2.5 mt-2"
    >
      {pending ? "Signing in…" : "Sign In"}
    </motion.button>
  );
}

export default function LoginForm({ timeoutNotice }: { timeoutNotice?: boolean }) {
  const [state, formAction] = useActionState(loginAction, initialState);
  const [forgotOpen, setForgotOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-sm"
    >
      <div className="flex flex-col items-center gap-2 mb-6 text-center">
        <div className="relative w-64 h-16">
          <Image src="/logo.png" alt="Eco Matrix Engineering" fill className="object-contain" priority sizes="256px" />
        </div>
        <p className="text-sm text-muted">Sign in to continue</p>
      </div>

      {timeoutNotice && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4"
        >
          You were signed out after 30 minutes of inactivity. Please sign in again.
        </motion.p>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label className="text-sm font-medium mb-1 block" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            className="glass-input w-full px-3 py-2.5"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="glass-input w-full px-3 py-2.5"
          />
        </div>

        <div className="text-right -mt-2">
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="text-xs hover:underline"
            style={{ color: "#667eea" }}
          >
            Forgot Password?
          </button>
        </div>

        {state?.error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          >
            {state.error}
          </motion.p>
        )}

        <SubmitButton />
      </form>

      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </motion.div>
  );
}
