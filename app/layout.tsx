import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/common/AppShell";
import { OrgConfigProvider } from "@/hooks/useOrgConfig";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agent OS (Real Estate)",
  description: "Real estate agent operating system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <OrgConfigProvider>
          <AppShell>{children}</AppShell>
        </OrgConfigProvider>
      </body>
    </html>
  );
}
