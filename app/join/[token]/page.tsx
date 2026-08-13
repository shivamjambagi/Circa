import JoinClient from "../JoinClient";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinClient initialToken={token} />;
}
