import type { Metadata } from "next";
import "./globals.css";
import ClientRoot from "./ClientRoot";

export const metadata: Metadata = {
    title: "GLaDOS",
    description: "General Local Anomoly Detection Observation System",
    icons: {
        icon: "/icon.svg",
    },
};

const themeScript = `
(function() {
    try {
        if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return;
        var s = localStorage.getItem('gladosApp:state');
        if (s) {
            var p = JSON.parse(s);
            if (p.theme === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
        }
    } catch (e) {}
})();
`;

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning className="overscroll-none">
            <body className="antialiased">
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
                <ClientRoot>{children}</ClientRoot>
            </body>
        </html>
    );
}
