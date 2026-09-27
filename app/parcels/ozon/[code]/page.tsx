import { prisma } from "@/lib/db";
import { getTracking } from "@/lib/ozon";
import ParcelView from "@/components/ParcelView";

export const dynamic = "force-dynamic";

export default async function OzonParcelDetailPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code);

  const parcel = await prisma.parcel.findUnique({
    where: { carrier_code: { carrier: "OZON", code } },
  });

  let tracking: Awaited<ReturnType<typeof getTracking>> | null = null;
  let trackingError: string | null = null;
  try {
    tracking = await getTracking(code);
  } catch (err) {
    trackingError = err instanceof Error ? err.message : String(err);
  }

  return (
    <ParcelView
      carrier="ozon"
      code={code}
      parcel={parcel}
      trackingError={trackingError}
      history={(tracking?.history ?? []).map((event) => ({
        status: event.status,
        time: event.timeStr,
        comment: event.comment,
      }))}
    />
  );
}
