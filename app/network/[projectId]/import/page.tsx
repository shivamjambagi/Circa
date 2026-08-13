import NetworkImport from "./NetworkImport";

export default async function NetworkImportPage({ params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; return <NetworkImport projectId={projectId} />; }
