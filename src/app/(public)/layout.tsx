import { AuthLayout } from '@/components/auth/AuthLayout';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
