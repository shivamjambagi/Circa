import NetworkDashboard from "./NetworkDashboard";

export default async function NetworkPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params; return <NetworkDashboard projectId={projectId} />;
}
