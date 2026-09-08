import '@/styles/tailwind.css';

function MainLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="bg-neutral-100">{children}</body>
    </html>
  );
}

export default MainLayout;
