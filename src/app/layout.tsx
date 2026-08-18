import "./globals.css";

export const metadata = {
  title: "Sistema de barbearias",
  description: "Agendamento online para barbearias",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-paper text-ink min-h-screen">{children}</body>
    </html>
  );
}
