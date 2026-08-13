import CommunityClient from "./CommunityClient";

export default async function CommunityPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <CommunityClient projectId={projectId} />;
}
