import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TelemetryProvider } from "../context/TelemetryContext";
import { ThemeProvider } from "../context/ThemeContext";
import AlertNotifications from "@/components/AlertNotifications";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aditya-L1 Solar Flare Early Warning System | ISRO Telemetry Dashboard",
  description:
    "Real-time solar X-ray telemetry dashboard for ISRO's Aditya-L1 mission. Visualizes HEL1OS and SoLEXS data with ML-powered nowcasting and forecasting engines.",
  keywords: ["ISRO", "Aditya-L1", "Solar Flare", "Space Weather", "Telemetry"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased">
        <ThemeProvider>
          <TelemetryProvider>
            {children}
            <AlertNotifications />
          </TelemetryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
