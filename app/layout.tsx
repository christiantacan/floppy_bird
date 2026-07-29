import './globals.css'

export const metadata = {
  title: 'Floppy Bird: Penguin Edition',
  description: 'A goofy Floppy Bird parody with a clumsy penguin',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
