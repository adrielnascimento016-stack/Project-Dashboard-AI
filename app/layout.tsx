import type {Metadata} from 'next';
import './globals.css'; // Global styles
import { AuthProvider } from '@/components/auth-provider';

export const metadata: Metadata = {
  title: 'Moto Analytics Pro',
  description: 'Gestão de Indicadores em Tempo Real',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
