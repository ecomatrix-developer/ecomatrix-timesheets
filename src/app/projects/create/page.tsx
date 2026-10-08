import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import PageTransition from "@/components/PageTransition";
import CreateProjectClient from "./CreateProjectClient";

export default async function CreateProjectPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  return (
    <PageTransition>
      <CreateProjectClient />
    </PageTransition>
  );
}
