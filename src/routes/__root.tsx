import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { GlobalFriendsProvider } from "@/components/GlobalFriendsProvider";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Sahifa topilmadi</h2>
        <a
          href="/"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Bosh sahifa
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Birga Tomosha — Do'stlar bilan kino ko'ring" },
      { name: "description", content: "Sinxron video pleer, kamera va ovoz aloqasi bilan birga kino tomosha qilish ilovasi." },
      { property: "og:title", content: "Birga Tomosha — Do'stlar bilan kino ko'ring" },
      { name: "twitter:title", content: "Birga Tomosha — Do'stlar bilan kino ko'ring" },
      { property: "og:description", content: "Sinxron video pleer, kamera va ovoz aloqasi bilan birga kino tomosha qilish ilovasi." },
      { name: "twitter:description", content: "Sinxron video pleer, kamera va ovoz aloqasi bilan birga kino tomosha qilish ilovasi." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7f4f3fb4-3859-4f6d-bf7e-f13844dad737/id-preview-6118391d--c3c05359-01d8-4b33-983e-de5f8f4aa8f3.lovable.app-1776951720230.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7f4f3fb4-3859-4f6d-bf7e-f13844dad737/id-preview-6118391d--c3c05359-01d8-4b33-983e-de5f8f4aa8f3.lovable.app-1776951720230.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: () => (
    <GlobalFriendsProvider>
      <Outlet />
    </GlobalFriendsProvider>
  ),
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="dark">
        {children}
        <Toaster theme="dark" position="top-center" />
        <Scripts />
      </body>
    </html>
  );
}
