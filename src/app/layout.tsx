import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FancyModeProvider } from "@/hooks/useFancyMode";
import { ThemeProvider } from "@/hooks/useTheme";
import { FancyModeToggle } from "@/components/FancyModeToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Narrative Review",
  description: "Code review as a story, not a file list",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('narrative-review:theme');if(t==='light')document.documentElement.classList.remove('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-bg-primary transition-colors`}
      >
        <ThemeProvider>
          <FancyModeProvider>
            {children}
            <FancyModeToggle />
          </FancyModeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
