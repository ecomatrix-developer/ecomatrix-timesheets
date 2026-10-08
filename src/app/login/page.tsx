import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LoginForm from "./LoginForm";
import LoginIllustration from "@/components/LoginIllustration";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const { reason } = await searchParams;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
    >
      <div className="bg-white shadow-lg w-full max-w-4xl overflow-hidden grid grid-cols-1 md:grid-cols-2 rounded-2xl">
        <div className="hidden md:block">
          <LoginIllustration />
        </div>
        <div className="flex items-center justify-center p-8 sm:p-12">
          <LoginForm timeoutNotice={reason === "timeout"} />
        </div>
      </div>
    </div>
  );
}
