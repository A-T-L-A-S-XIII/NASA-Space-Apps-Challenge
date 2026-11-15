// As telas ficam em public/ (mockup estático); "/" é reescrito para /index.html no next.config.js.
export const metadata = { title: "Water Waltz" };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
