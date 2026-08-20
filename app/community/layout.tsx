import { FirebaseProvider } from "../firebase/FirebaseProvider";

export default function CommunityLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <FirebaseProvider>{children}</FirebaseProvider>;
}
