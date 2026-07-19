import './globals.css'

export const metadata = {
  title: 'Teamovia',
  description: 'Plateforme multi-agents IA',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}