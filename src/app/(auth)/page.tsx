import Map from '@/src/components/map'
import { getUsers, getTerritories } from '@/src/lib/queries'

export default async function Home() {
  const [users, territories] = await Promise.all([
    getUsers(),
    getTerritories()
  ])

  return <Map users={users} territories={territories} />
}

