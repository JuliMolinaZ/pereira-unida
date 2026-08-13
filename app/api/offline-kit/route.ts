import { getCollectionPoints } from "@/app/actions";
import { EMERGENCY_HOTLINES } from "@/lib/emergency";

export const dynamic = "force-dynamic";

/** Kit mínimo para consultar sin datos: teléfonos y direcciones de acopio. */
export async function GET() {
  const points = await getCollectionPoints();

  return Response.json(
    {
      generated_at: new Date().toISOString(),
      hotlines: EMERGENCY_HOTLINES,
      points: points.map((point) => ({
        name: point.name,
        address: point.address,
        municipality: point.municipality,
        open_hours: point.open_hours,
        contact: point.contact,
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
