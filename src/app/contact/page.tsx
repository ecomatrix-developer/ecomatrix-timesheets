import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import PageTransition from "@/components/PageTransition";
import ContactFormClient from "./ContactFormClient";

export default async function ContactPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <PageTransition>
      <ContactFormClient name={session.name} />
    </PageTransition>
  );
}
