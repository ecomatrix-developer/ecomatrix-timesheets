import toast from "react-hot-toast";
import ConfirmToast from "@/components/ConfirmToast";
import { createElement } from "react";

/**
 * Replaces window.confirm() with an in-app toast that has real Confirm /
 * Cancel buttons, resolved as a Promise so call sites can keep an
 * `if (await confirmToast(...)) { ... }` shape almost identical to the
 * window.confirm() code they're replacing.
 */
export function confirmToast(message: string, options?: { confirmLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    toast.custom(
      (t) =>
        createElement(ConfirmToast, {
          visible: t.visible,
          message,
          confirmLabel: options?.confirmLabel ?? "Confirm",
          onConfirm: () => {
            toast.dismiss(t.id);
            resolve(true);
          },
          onCancel: () => {
            toast.dismiss(t.id);
            resolve(false);
          },
        }),
      { duration: Infinity, position: "top-center" }
    );
  });
}

export { toast };
