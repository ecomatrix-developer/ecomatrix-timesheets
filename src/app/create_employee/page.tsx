import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAllUsers } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import CreateEmployeeClient from "./CreateEmployeeClient";

export const dynamic = "force-dynamic";

export default async function CreateEmployeePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/login");

  const users = await getAllUsers();

  return (
    <PageTransition>
      <CreateEmployeeClient employees={users} />
    </PageTransition>
  );
}
