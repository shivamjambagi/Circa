import NetworkPath from "./NetworkPath";

export default async function NetworkPathPage({ params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; return <NetworkPath projectId={projectId} />; }
