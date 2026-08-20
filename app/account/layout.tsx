import { FirebaseProvider } from "../firebase/FirebaseProvider";

export default function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <FirebaseProvider>{children}</FirebaseProvider>;
}
