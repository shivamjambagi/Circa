import { FirebaseProvider } from "../firebase/FirebaseProvider";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <FirebaseProvider>{children}</FirebaseProvider>;
}
