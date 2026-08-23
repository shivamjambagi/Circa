type InviteMembershipTarget = {
  projectId: string;
  projectMode: "community" | "network";
  status: string;
};

type ExistingMembership = {
  role?: string;
  status?: string;
} | null;

export function activeInviteMembershipDestination(invite: InviteMembershipTarget, membership: ExistingMembership) {
  if (invite.status !== "active" || membership?.status !== "active") return null;
  return `/${invite.projectMode}/${invite.projectId}`;
}
