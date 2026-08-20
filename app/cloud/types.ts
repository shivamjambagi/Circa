export type MemberRole = "owner" | "admin" | "member";
export type ProjectMode = "map" | "community" | "network";
export type CommunityListType = "directory" | "event" | "bin" | "school" | "contact" | "custom";

export type PreviewSection = { id: string; title: string; description?: string; iconKey?: string };

export type CloudProject = {
  id: string;
  name: string;
  description: string;
  location: string;
  projectMode: ProjectMode;
  ownerId: string;
  category: string;
  timezone?: string;
  previewSections?: PreviewSection[];
  schemaVersion: number;
  archived?: boolean;
};

export type CommunityMember = {
  uid: string;
  role: MemberRole;
  status: "active" | "removed";
  displayName: string;
  isAnonymous: boolean;
  joinedViaInviteId: string;
  consented?: boolean;
  consentedAt?: unknown;
  consentVersion?: number;
  joinedAt?: unknown;
  contributionEnabled?: boolean;
};


export type CommunityMemberSummary = {
  uid: string;
  role: MemberRole;
  status: "active" | "removed";
  displayName: string;
  joinedAt?: unknown;
};

export type CommunityList = {
  id: string;
  title: string;
  description: string;
  listType: CommunityListType;
  order: number;
  schemaVersion: number;
};

export type CollectionSchedule = {
  type: "once" | "weekly" | "fortnightly" | "custom";
  firstCollectionDate: string;
  intervalWeeks?: number;
  weekday?: number;
};

export type CommunityItem = {
  id: string;
  title: string;
  details: string;
  description?: string;
  category: string;
  itemType?: CommunityListType;
  phone?: string;
  email?: string;
  url?: string;
  website?: string;
  address?: string;
  notes?: string;
  openingInformation?: string;
  date?: string;
  startDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  schoolType?: string;
  binType?: string;
  schedule?: CollectionSchedule;
  timezone?: string;
  areaLabel?: string;
  enabled?: boolean;
  customFields?: Record<string, string>;
  order: number;
  createdBy?: string;
  createdByName?: string;
  contentVersion?: number;
  schemaVersion: number;
};

export type EditProposal = {
  id: string;
  projectId: string;
  listId: string;
  itemId: string;
  operation: "create" | "update" | "delete";
  currentItem?: CommunityItem | null;
  baseVersion: number;
  proposedItem: Omit<CommunityItem, "id"> | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  submittedBy: string;
  submittedByName: string;
  submittedAt?: unknown;
  reviewedBy?: string;
  reviewedAt?: unknown;
  reviewNote?: string;
};

export type PublicInvite = {
  token: string;
  projectId: string;
  projectMode: "community" | "network";
  projectName: string;
  description: string;
  location: string;
  code: string;
  label?: string;
  status: "active" | "revoked";
  expiresAt: string | null;
  previewSections: PreviewSection[];
  createdBy?: string;
  createdAt?: unknown;
  revokedAt?: unknown;
  schemaVersion: number;
};
