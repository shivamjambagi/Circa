import { FirebaseProvider } from "../firebase/FirebaseProvider";

export default function JoinLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <FirebaseProvider>{children}</FirebaseProvider>;
}
