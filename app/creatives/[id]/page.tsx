import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import WorkerBanner from "@/components/WorkerBanner";
import { formatDateTimeMa } from "@/lib/format";
import { getWorkerStatus } from "@/lib/creatives";
import CreativeResults from "./CreativeResults";

export const dynamic = "force-dynamic";

export default async function CreativeDetailPage({ params }: { params: { id: string } }) {
  const [request, worker] = await Promise.all([
    prisma.creativeRequest.findUnique({
      where: { id: params.id },
      include: { images: { orderBy: { position: "asc" } } },
    }),
    getWorkerStatus(),
  ]);
  if (!request) notFound();

  return (
    <>
      <PageHeader
        back={{ href: "/creatives", label: "Créatives" }}
        title={request.productName}
        subtitle={formatDateTimeMa(request.createdAt)}
      />

      <WorkerBanner initial={worker} />

      <CreativeResults
        requestId={request.id}
        productName={request.productName}
        sourcePhotoUrl={request.sourcePhotoUrl}
        initialStatus={request.status}
        initialImages={request.images.map((i) => ({
          id: i.id,
          angleKey: i.angleKey,
          position: i.position,
          status: i.status,
          errorMessage: i.errorMessage,
          imageUrl: i.imageUrl,
        }))}
      />
    </>
  );
}
