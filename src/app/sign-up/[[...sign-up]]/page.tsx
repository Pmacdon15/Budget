import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp />
    </AuthShell>
  );
}
