import { AuthGate } from '@/components/auth/auth-gate';
import { Studio } from '@/components/studio';

export default function HomePage() {
  return (
    <AuthGate>
      <Studio />
    </AuthGate>
  );
}
