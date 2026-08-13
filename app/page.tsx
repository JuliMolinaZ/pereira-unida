import { getHomeData } from "@/app/actions";
import HomeClient from "@/components/HomeClient";

/** HTML cacheado en el CDN (~20 s). Instagram deja de esperar a Supabase en cada toque. */
export const revalidate = 20;

export default async function Home() {
  const { reports, points, roads, error } = await getHomeData();

  return (
    <HomeClient
      initialReports={reports}
      initialPoints={points}
      initialRoads={roads}
      dataError={error}
    />
  );
}
