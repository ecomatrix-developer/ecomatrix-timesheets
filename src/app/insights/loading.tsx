import PageTransition from "@/components/PageTransition";
import PageSkeleton from "@/components/PageSkeleton";

export default function Loading() {
  return (
    <PageTransition>
      <PageSkeleton statCards={0} tableRows={6} />
    </PageTransition>
  );
}
