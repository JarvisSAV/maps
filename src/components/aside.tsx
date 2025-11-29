import Link from 'next/link'

export default function Aside() {
  return (
    <aside
      className="[grid-area:aside] mr-2 hidden aside-open:block aside-open:w-32 w-0 transition-all transition-discrete overflow-hidden aside-open:starting:w-0">
      <ul>
        <li><Link href="/">Inicio</Link></li>
        <li><Link href="/gemini">Gemini</Link></li>
      </ul>
    </aside>
  )
}
