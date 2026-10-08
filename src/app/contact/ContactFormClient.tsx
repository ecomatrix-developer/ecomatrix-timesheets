"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { motion } from "framer-motion";
import { submitContactFormAction, type ContactFormState } from "@/app/(actions)/contactActions";
import { toast } from "@/lib/toast";
import { FaEnvelope, FaPaperPlane } from "react-icons/fa";

const initialState: ContactFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      type="submit"
      disabled={pending}
      className="btn-primary inline-flex items-center justify-center gap-2 py-2.5"
    >
      <FaPaperPlane className="h-3.5 w-3.5" /> {pending ? "Sending…" : "Send Message"}
    </motion.button>
  );
}

export default function ContactFormClient({ name }: { name: string }) {
  const [state, formAction] = useActionState(submitContactFormAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success("Your message has been sent.");
      formRef.current?.reset();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2">
        <FaEnvelope className="text-accent" /> Contact Us
      </h1>
      <p className="text-sm text-muted mb-6">
        Send a message directly to Eco Matrix Engineering&apos;s management team — it
        goes straight to their inbox, no external site needed.
      </p>

      <motion.form
        ref={formRef}
        action={formAction}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong p-6 flex flex-col gap-4"
      >
        <div>
          <label className="text-sm text-muted mb-1 block">From</label>
          <input
            value={name}
            disabled
            className="glass-input w-full px-3 py-2 bg-gray-50 text-muted"
          />
        </div>
        <div>
          <label className="text-sm text-muted mb-1 block">Subject *</label>
          <input
            name="subject"
            required
            placeholder="What's this about?"
            className="glass-input w-full px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm text-muted mb-1 block">Message *</label>
          <textarea
            name="message"
            required
            rows={6}
            placeholder="Write your message here…"
            className="glass-input w-full px-3 py-2"
          />
        </div>

        <SubmitButton />
      </motion.form>
    </div>
  );
}
