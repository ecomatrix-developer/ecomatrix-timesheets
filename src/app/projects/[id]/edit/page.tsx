import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getProjectById } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import ProjectForm from "../../ProjectForm";
import { updateProjectAction } from "@/app/(actions)/projectActions";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) notFound();

  const boundAction = updateProjectAction.bind(null, id);

  return (
    <PageTransition>
      <ProjectForm project={project} action={boundAction} />
    </PageTransition>
  );
}
