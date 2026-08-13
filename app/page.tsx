import { getHomeData } from "@/app/actions";
import HomeClient from "@/components/HomeClient";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ reporte?: string | string[] }>;
}) {
  const { reports, points, error } = await getHomeData();

  const sp = await searchParams;
  const raw = sp.reporte;
  const initialReportId = Array.isArray(raw) ? raw[0] : (raw ?? null);

  // dataError lo consume HomeClient (a cargo de otro agente) para mostrar
  // el aviso de configuración y desactivar Realtime cuando Supabase no
  // responde. Se pasa vía spread de una variable (no un objeto literal)
  // para que TypeScript no aplique excess-property-checking mientras
  // HomeClientProps todavía no declara `dataError` explícitamente.
  const dataErrorProp = { dataError: error };

  return (
    <HomeClient
      initialReports={reports}
      initialPoints={points}
      initialReportId={initialReportId}
      {...dataErrorProp}
    />
  );
}
