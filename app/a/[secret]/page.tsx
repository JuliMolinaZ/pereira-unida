import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCollectionPoints, isAcopioSecretValid } from "@/app/actions";
import AcopioAdminClient from "@/components/AcopioAdminClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pereira Unida",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AcopioSecretPage({
  params,
}: {
  params: Promise<{ secret: string }>;
}) {
  const { secret } = await params;
  if (!(await isAcopioSecretValid(secret))) {
    notFound();
  }

  const points = await getCollectionPoints();
  return <AcopioAdminClient accessKey={secret} initialPoints={points} />;
}
