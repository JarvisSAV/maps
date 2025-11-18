import Aside from '@/src/components/aside'
import Header from '@/src/components/header'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-2 grid grid-cols-[auto_1fr] grid-rows-[auto_1fr] [grid-template-areas:'aside_header'_'aside_main'] h-full *:rounded-xl">
      <Aside />
      <Header />
      <main className="[grid-area:main] bg-green-500">
        {children}
      </main>
    </div>
  )
}
