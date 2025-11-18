'use client'

export default function Header() {

  const handleToggleAside = () => {
    const htmlElement = document.documentElement
    const isAsideOpen = htmlElement.getAttribute('data-aside-open') === 'true'
    htmlElement.setAttribute('data-aside-open', (!isAsideOpen).toString())
  }

  return (
    <header className="[grid-area:header] bg-sky-500 mb-2 gap-2 flex items-center">
      <button
        onClick={handleToggleAside}
        className="cursor-pointer text-red-500 text-2xl font-bold"
      >&times;</button>
      Header
    </header>
  )
}
