import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creditos CB",
  description: "Aplicacion web para administrar clientes, prestamos y pagos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
