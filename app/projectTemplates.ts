import type { ProjectCategory, RelationshipType } from "./graphStore.ts";

export type RelationshipOption = { label: string; style: RelationshipType };

export type ProjectTemplate = {
  label: string;
  description: string;
  icon: string;
  accent: string;
  emptyHint: string;
  relationships: RelationshipOption[];
  suggestedGroups: string[];
  cardDetail: "personal" | "school" | "business" | "family" | "community" | "neutral";
};

export const projectTemplates: Record<ProjectCategory, ProjectTemplate> = {
  personal: {
    label: "Personal",
    description: "Friends and people in your everyday life.",
    icon: "∞",
    accent: "yellow",
    emptyHint: "Add someone you know.",
    relationships: [
      { label: "Best friend", style: "very-close" },
      { label: "Close friend", style: "close" },
      { label: "Friend", style: "friend" },
      { label: "Acquaintance", style: "acquaintance" },
      { label: "Neighbour", style: "friend" },
      { label: "Childhood friend", style: "close" },
      { label: "Online friend", style: "friend" },
      { label: "Met through", style: "acquaintance" },
    ],
    suggestedGroups: ["Friends", "Neighbours", "Online", "Childhood"],
    cardDetail: "personal",
  },
  school: {
    label: "School",
    description: "Classmates, teachers, clubs and school connections.",
    icon: "▱",
    accent: "blue",
    emptyHint: "Add a classmate, teacher or someone from school.",
    relationships: [
      { label: "Classmate", style: "friend" },
      { label: "Friend", style: "friend" },
      { label: "Close friend", style: "close" },
      { label: "Teacher", style: "professional" },
      { label: "Tutor", style: "professional" },
      { label: "Project partner", style: "close" },
      { label: "Club member", style: "friend" },
      { label: "Same subject", style: "acquaintance" },
    ],
    suggestedGroups: ["Computer Science", "Mathematics", "Teachers", "Form", "Clubs", "Sports", "Friends"],
    cardDetail: "school",
  },
  business: {
    label: "Business",
    description: "Colleagues, mentors, clients and professional contacts.",
    icon: "▤",
    accent: "sage",
    emptyHint: "Add a colleague, mentor or professional contact.",
    relationships: [
      { label: "New contact", style: "acquaintance" },
      { label: "Colleague", style: "professional" },
      { label: "Manager", style: "professional" },
      { label: "Mentor", style: "close" },
      { label: "Mentee", style: "friend" },
      { label: "Client", style: "professional" },
      { label: "Recruiter", style: "acquaintance" },
      { label: "Partner", style: "professional" },
      { label: "Vendor", style: "professional" },
      { label: "Former colleague", style: "friend" },
      { label: "Strong connection", style: "close" },
    ],
    suggestedGroups: ["Company", "Mentors", "Clients", "Events", "Recruiters"],
    cardDetail: "business",
  },
  family: {
    label: "Family",
    description: "Relatives and family connections.",
    icon: "⌁",
    accent: "coral",
    emptyHint: "Add someone from your family.",
    relationships: [
      { label: "Parent", style: "family" },
      { label: "Sibling", style: "family" },
      { label: "Grandparent", style: "family" },
      { label: "Cousin", style: "family" },
      { label: "Aunt", style: "family" },
      { label: "Uncle", style: "family" },
      { label: "Partner", style: "very-close" },
      { label: "Child", style: "family" },
      { label: "Relative", style: "family" },
      { label: "Family friend", style: "friend" },
    ],
    suggestedGroups: ["Immediate family", "Extended family", "Family friends"],
    cardDetail: "family",
  },
  community: {
    label: "Community map",
    description: "Privately map people from a club, team, society or local group.",
    icon: "◌",
    accent: "lilac",
    emptyHint: "Add someone from your group.",
    relationships: [
      { label: "Member", style: "friend" },
      { label: "Friend", style: "friend" },
      { label: "Team member", style: "close" },
      { label: "Coach", style: "professional" },
      { label: "Leader", style: "professional" },
      { label: "Organiser", style: "professional" },
      { label: "Mentor", style: "close" },
      { label: "Met through", style: "acquaintance" },
    ],
    suggestedGroups: ["Team", "Organisers", "Members", "Coaches"],
    cardDetail: "community",
  },
  other: {
    label: "Other",
    description: "Create your own type of network.",
    icon: "✦",
    accent: "graphite",
    emptyHint: "Add the first person.",
    relationships: [
      { label: "Connection", style: "friend" },
      { label: "Strong connection", style: "close" },
      { label: "Known through", style: "acquaintance" },
      { label: "Member", style: "friend" },
      { label: "Introduced by", style: "acquaintance" },
    ],
    suggestedGroups: [],
    cardDetail: "neutral",
  },
};

export function displayCategory(category: ProjectCategory, customCategoryName = "") {
  return category === "other" && customCategoryName.trim() ? customCategoryName.trim() : projectTemplates[category].label;
}
