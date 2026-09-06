// Minimal layout for print-optimized report pages.
// No sidebar, no navigation — clean white background for printing.

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-gray-100 print:bg-white">
        {children}
      </body>
    </html>
  );
}
