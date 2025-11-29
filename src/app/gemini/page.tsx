'use client'
import { useState, useCallback } from 'react'
import { GameState, User, Coordinate, Territory } from './types'
import { Trophy, RefreshCw, AlertTriangle, Info, Bike, MapPin, Edit3, Trash2, ArrowLeftRight } from 'lucide-react'
import { polygon as createPolygon, area, intersect, difference, featureCollection } from '@turf/turf'
import dynamic from 'next/dynamic'
import { GeminiScout } from '@/src/app/gemini/gemini-scout'

// Import WorldMap dynamically to avoid SSR issues with Leaflet
const WorldMap = dynamic(
  () => import('@/src/app/gemini/world-map').then(mod => ({ default: mod.WorldMap })),
  { ssr: false }
)

// Initial Guadalajara Coordinates
const GDL_CENTER = { lat: 20.6767, lng: -103.3475 }

const INITIAL_USERS: Record<string, User> = {
  USER_A: { id: 'USER_A', name: 'JaliscoRider', color: 'bg-cyan-500', fillColor: '#06b6d4', score: 0 },
  USER_B: { id: 'USER_B', name: 'TapatioSpeed', color: 'bg-pink-500', fillColor: '#ec4899', score: 0 }
}

// Helper to convert internal Coordinate[][] to Turf GeoJSON Polygon format (number[][][])
const toTurfPolygon = (terrCoords: Coordinate[][]) => {
  const rings = terrCoords.map(ring => {
    // GeoJSON is [lng, lat]
    const r = ring.map(c => [c.lng, c.lat])
    // Ensure closed ring
    if (r.length > 0) {
      const first = r[0]
      const last = r[r.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) {
        r.push(first)
      }
    }
    return r
  })
  return createPolygon(rings)
}

// Helper to convert Turf GeoJSON coords back to internal Coordinate[][]
const fromTurfCoords = (coords: number[][][]) => {
  // coords is number[][][] (Array of Rings, where Ring is Array of [lng, lat])
  return coords.map(ring => {
    const r = ring.map((p: number[]) => ({ lat: p[1], lng: p[0] }))
    r.pop() // Remove closing point for internal state
    return r
  })
}

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    territories: [],
    currentUser: INITIAL_USERS.USER_A,
    users: INITIAL_USERS,
    activePath: [],
    mapCenter: GDL_CENTER,
    zoom: 15
  })

  const [isEditMode, setIsEditMode] = useState(false)
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null)

  const [notification, setNotification] = useState<{ msg: string, type: 'info' | 'success' | 'alert' } | null>(null)

  const showNotification = (msg: string, type: 'info' | 'success' | 'alert' = 'info') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 4000)
  }

  const switchTurn = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      currentUser: prev.currentUser.id === 'USER_A' ? prev.users.USER_B : prev.users.USER_A,
      activePath: []
    }))
  }, [])

  // Calculate Scores (Area Calculation) - derived state
  const calculateScores = (territories: Territory[]) => {
    const scores = { USER_A: 0, USER_B: 0 }

    territories.forEach(terr => {
      try {
        if (terr.coordinates.length === 0 || terr.coordinates[0].length < 3) return

        const poly = toTurfPolygon(terr.coordinates)
        const a = area(poly) // sq meters

        if (terr.ownerId === 'USER_A') scores.USER_A += a
        else if (terr.ownerId === 'USER_B') scores.USER_B += a
      } catch {
        // Invalid polygon, skip
      }
    })

    return scores
  }

  // Update users with calculated scores
  const currentScores = calculateScores(gameState.territories)
  const usersWithScores = {
    USER_A: { ...gameState.users.USER_A, score: Math.round(currentScores.USER_A) },
    USER_B: { ...gameState.users.USER_B, score: Math.round(currentScores.USER_B) }
  }

  // Handle adding a point to the path
  const handleMapClick = (coord: Coordinate) => {
    if (isEditMode) return // Do not add points in edit mode
    setGameState(prev => ({
      ...prev,
      activePath: [...prev.activePath, coord]
    }))
  }

  const handleTerritoryClick = (id: string) => {
    if (isEditMode) {
      setSelectedTerritoryId(id === '' ? null : id)
    }
  }

  const updateTerritoryShape = (id: string, newCoordinates: Coordinate[][]) => {
    setGameState(prev => ({
      ...prev,
      territories: prev.territories.map(t =>
        t.id === id ? { ...t, coordinates: newCoordinates } : t
      )
    }))
  }

  // Toggle Edit Mode
  const toggleEditMode = () => {
    if (!isEditMode) {
      // Entering Edit Mode: Clear current drawing path
      setGameState(s => ({ ...s, activePath: [] }))
      setIsEditMode(true)
      showNotification('Edit Mode: Drag points to adjust borders.', 'info')
    } else {
      // Exiting Edit Mode: Clear selection
      setSelectedTerritoryId(null)
      setIsEditMode(false)
    }
  }

  // Delete Selected Territory
  const deleteTerritory = () => {
    if (!selectedTerritoryId) return
    setGameState(prev => ({
      ...prev,
      territories: prev.territories.filter(t => t.id !== selectedTerritoryId)
    }))
    setSelectedTerritoryId(null)
    showNotification('Territory deleted.', 'info')
  }

  // Switch Owner of Selected Territory
  const switchOwner = () => {
    if (!selectedTerritoryId) return
    setGameState(prev => ({
      ...prev,
      territories: prev.territories.map(t => {
        if (t.id === selectedTerritoryId) {
          return { ...t, ownerId: t.ownerId === 'USER_A' ? 'USER_B' : 'USER_A' }
        }
        return t
      })
    }))
  }

  // Handle clicking a marker (specifically determining if we close the loop)
  const handleMarkerClick = (coord: Coordinate, isStart: boolean) => {
    if (isStart && gameState.activePath.length > 2) {
      completeTerritory()
    }
  }

  // The Core Logic: Creating and Stealing Territory
  const completeTerritory = () => {
    const { activePath, currentUser, territories } = gameState

    // New territory is initially a single ring (no holes)
    const newTerritoryShape = [activePath]
    let newPoly: ReturnType<typeof toTurfPolygon>

    try {
      newPoly = toTurfPolygon(newTerritoryShape)
    } catch {
      showNotification('Invalid path shape. Try avoiding self-intersections.', 'alert')
      return
    }

    const newTerritoryId = `${currentUser.id}-${Date.now()}`
    // We will build a new list of territories.
    // Some old ones might be modified (shrunk/split) or removed.
    const nextTerritories: Territory[] = []
    let stolenArea = false

    try {
      // Process existing territories to see if they are cut by the new one
      for (const terr of territories) {
        // If it's my own territory, we just keep it. 
        if (terr.ownerId === currentUser.id) {
          nextTerritories.push(terr)
          continue
        }

        const terrPoly = toTurfPolygon(terr.coordinates)

        // Check intersection
        const intersection = intersect(featureCollection([terrPoly, newPoly]))

        if (intersection) {
          stolenArea = true

          // Calculate the difference: OpponentTerritory - NewTerritory
          // logic: The opponent loses the part that overlaps with the new territory.
          const diff = difference(featureCollection([terrPoly, newPoly]))

          if (!diff) {
            // Completely consumed
            continue
          } else {
            if (diff.geometry.type === 'Polygon') {
              // Modified shape (e.g., edge cut or hole created)
              // geometry.coordinates is number[][][] (Rings)
              const newCoords = fromTurfCoords(diff.geometry.coordinates)
              nextTerritories.push({ ...terr, coordinates: newCoords })
            } else if (diff.geometry.type === 'MultiPolygon') {
              // Split into islands
              // geometry.coordinates is number[][][][] (Polygons -> Rings)
              diff.geometry.coordinates.forEach((polyCoords: number[][][], idx: number) => {
                const newCoords = fromTurfCoords(polyCoords)
                nextTerritories.push({
                  ...terr,
                  id: `${terr.id}-split-${idx}`, // New ID for split piece
                  coordinates: newCoords
                })
              })
            }
          }
        } else {
          // No overlap, keep original
          nextTerritories.push(terr)
        }
      }

      // Finally, add the new territory
      nextTerritories.push({
        id: newTerritoryId,
        ownerId: currentUser.id,
        coordinates: newTerritoryShape, // [[coords]]
        timestamp: Date.now()
      })

    } catch {
      showNotification('Complex intersection error. Try a simpler shape.', 'alert')
      return
    }

    setGameState(prev => ({
      ...prev,
      territories: nextTerritories,
      activePath: []
    }))

    if (stolenArea) {
      showNotification('TERRITORY STOLEN! You cut through their lines.', 'success')
    } else {
      showNotification('New Territory Claimed in Guadalajara!', 'success')
    }

    setTimeout(switchTurn, 1500)
  }

  const handleLocationFound = (locationName: string) => {
    const randomOffsetLat = (Math.random() - 0.5) * 0.01
    const randomOffsetLng = (Math.random() - 0.5) * 0.01

    setGameState(prev => ({
      ...prev,
      mapCenter: { lat: GDL_CENTER.lat + randomOffsetLat, lng: GDL_CENTER.lng + randomOffsetLng },
      zoom: 16
    }))
    showNotification(`Scouted: ${locationName}. Map centered.`, 'info')
  }

  const resetGame = () => {
    setGameState(prev => ({
      ...prev,
      territories: [],
      activePath: [],
      users: {
        USER_A: { ...INITIAL_USERS.USER_A, score: 0 },
        USER_B: { ...INITIAL_USERS.USER_B, score: 0 }
      },
      currentUser: INITIAL_USERS.USER_A
    }))
    showNotification('Map Reset. Fight for Guadalajara begins anew.', 'info')
  }

  const selectedTerritory = gameState.territories.find(t => t.id === selectedTerritoryId)

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row overflow-hidden">

      {/* Sidebar */}
      <aside className="w-full md:w-80 lg:w-96 bg-slate-900 border-r border-slate-800 flex flex-col z-20 shadow-xl">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-black italic tracking-tighter text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-pink-500 flex items-center gap-2">
            <Bike className="w-6 h-6 text-white" />
            CYCLEWARS <span className="text-xs text-slate-500 not-italic font-mono mt-1">GDL</span>
          </h1>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-6">
          <GeminiScout onLocationFound={handleLocationFound} />

          {/* Mode Switcher */}
          <div className="bg-slate-800 rounded-lg p-1 flex">
            <button
              onClick={() => isEditMode && toggleEditMode()}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${!isEditMode ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <Bike className="w-4 h-4" /> Ride (Draw)
            </button>
            <button
              onClick={() => !isEditMode && toggleEditMode()}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${isEditMode ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <Edit3 className="w-4 h-4" /> Edit Map
            </button>
          </div>

          {/* Edit Mode Panel */}
          {isEditMode && (
            <div className="bg-amber-900/10 border border-amber-800/50 rounded-lg p-4 animate-fadeIn">
              <h3 className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Info className="w-3 h-3" /> Edit Mode Active
              </h3>
              <p className="text-xs text-slate-400 mb-4">Click any territory to select it. Drag corners to adjust shape.</p>

              {selectedTerritory ? (
                <div className="space-y-3 bg-slate-900/50 p-3 rounded border border-amber-900/30">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">Owner:</span>
                    <span className="font-bold" style={{ color: gameState.users[selectedTerritory.ownerId].fillColor }}>
                      {gameState.users[selectedTerritory.ownerId].name}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={switchOwner} className="bg-slate-700 hover:bg-slate-600 text-white text-xs py-2 rounded flex items-center justify-center gap-1 transition-colors">
                      <ArrowLeftRight className="w-3 h-3" /> Swap Owner
                    </button>
                    <button onClick={deleteTerritory} className="bg-red-900/50 hover:bg-red-900 text-red-200 text-xs py-2 rounded flex items-center justify-center gap-1 transition-colors">
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500 italic text-sm border-2 border-dashed border-slate-800 rounded">
                  No territory selected
                </div>
              )}
            </div>
          )}

          {/* Scores */}
          {!isEditMode && (
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Territory Control (m²)</h3>

              {/* User A */}
              <div className={`p-3 rounded-lg border transition-all mb-2 ${gameState.currentUser.id === 'USER_A' ? 'border-cyan-500 bg-cyan-900/20' : 'border-slate-800 bg-slate-900'}`}>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-cyan-400">{usersWithScores.USER_A.name}</span>
                  <span className="font-mono text-lg">{usersWithScores.USER_A.score.toLocaleString()}</span>
                </div>
              </div>

              {/* User B */}
              <div className={`p-3 rounded-lg border transition-all ${gameState.currentUser.id === 'USER_B' ? 'border-pink-500 bg-pink-900/20' : 'border-slate-800 bg-slate-900'}`}>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-pink-400">{usersWithScores.USER_B.name}</span>
                  <span className="font-mono text-lg">{usersWithScores.USER_B.score.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {!isEditMode && (
            <div className="bg-slate-800/50 p-4 rounded-lg text-xs text-slate-400 border border-slate-700">
              <p className="flex gap-2 mb-2"><Info className="w-4 h-4 text-indigo-400 shrink-0" /> <span>Click map points to plan route.</span></p>
              <p className="flex gap-2"><Trophy className="w-4 h-4 text-yellow-400 shrink-0" /> <span>Click your START point to close the loop and claim the block. Cut through enemies to steal!</span></p>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-900 border-t border-slate-800 grid grid-cols-2 gap-2">
          <button onClick={switchTurn} disabled={isEditMode} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm font-medium transition-colors disabled:opacity-50">Skip Turn</button>
          <button onClick={resetGame} className="px-4 py-2 bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1"><RefreshCw className="w-3 h-3" /> Reset</button>
        </div>
      </aside>

      {/* Map Area */}
      <main className="flex-1 relative">
        {/* Top Overlay */}
        <div className="absolute top-4 left-4 right-4 sm:left-auto sm:right-4 z-1000 pointer-events-none">
          <div className="bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-2xl flex items-center gap-3">
            <MapPin className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">Guadalajara, Jalisco</h2>
              <p className="text-xs text-slate-400">{isEditMode ? 'Edit Mode Active' : 'Live Operation'}</p>
            </div>
          </div>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div className={`absolute top-20 left-1/2 -translate-x-1/2 z-2000 px-6 py-3 rounded-full shadow-2xl border flex items-center gap-2 animate-bounce
                ${notification.type === 'alert' ? 'bg-red-500 border-red-400 text-white' :
            notification.type === 'success' ? 'bg-green-500 border-green-400 text-white' :
              'bg-indigo-600 border-indigo-400 text-white'}`}>
            {notification.type === 'alert' && <AlertTriangle className="w-4 h-4" />}
            <span className="font-bold tracking-wide text-sm">{notification.msg}</span>
          </div>
        )}

        <WorldMap
          gameState={gameState}
          onMapClick={handleMapClick}
          onMarkerClick={handleMarkerClick}
          isEditMode={isEditMode}
          selectedTerritoryId={selectedTerritoryId}
          onTerritoryClick={handleTerritoryClick}
          onTerritoryUpdate={updateTerritoryShape}
        />
      </main>
    </div>
  )
}

export default App
