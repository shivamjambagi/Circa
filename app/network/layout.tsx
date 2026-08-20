import { FirebaseProvider } from "../firebase/FirebaseProvider";

export default function NetworkLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <FirebaseProvider>{children}</FirebaseProvider>;
}
