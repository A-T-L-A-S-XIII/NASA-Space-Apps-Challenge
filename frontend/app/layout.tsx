import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taquari Flood Watch",
  description: "Radar-observed candidate water and access in the Taquari Valley, from NISAR with Sentinel-1 as a complement.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <span className="brand">Taquari Flood Watch</span>
          <span className="tagline">NISAR radar observations · Taquari Valley, RS</span>
        </header>
        {children}
      </body>
    </html>
  );
}
