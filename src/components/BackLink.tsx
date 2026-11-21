import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa";

/**
 * A fixed destination, not router.back() — predictable regardless of how
 * the user actually arrived on the page (direct URL, a refresh, a link
 * from elsewhere), unlike browser/history-based back navigation.
 */
export default function BackLink({
  href,
  label = "Back",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-2 text-sm text-accent hover:underline"
    >
      <FaArrowLeft className="h-3 w-3" /> {label}
    </Link>
  );
}
