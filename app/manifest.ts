import type { MetadataRoute } from "next";

// Icône et nom quand le CRM est ajouté à l'écran d'accueil du téléphone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mario Toys CRM",
    short_name: "Mario CRM",
    start_url: "/",
    display: "standalone",
    background_color: "#1C1E22",
    theme_color: "#1C1E22",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
