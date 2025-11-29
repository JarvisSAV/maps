'use client'

import { APIProvider, Map as GoogleMaps, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { useState, useEffect, useCallback } from 'react'
import { Territory, User, Coordinate } from '../types'
import { polygon as createPolygon, intersect, difference, featureCollection, booleanContains } from '@turf/turf'
import { createTerritory, updateTerritory } from '../app/actions/territories'
import { useRouter } from 'next/navigation'

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string

interface Map {
  users: User[]
  territories: Territory[]
}

function MapContent({ selectedUser, setSelectedUser, users, territories }: { 
  selectedUser: string, 
  setSelectedUser: (value: string) => void,
  users: User[], 
  territories: Territory[] 
}) {
  const map = useMap()
  const mapsLibrary = useMapsLibrary('maps')
  const router = useRouter()
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPolygon, setCurrentPolygon] = useState<Coordinate[]>([])
  const [polygons, setPolygons] = useState<Array<{ id: string, coordinates: Coordinate[], color: string, userId?: string, _id?: string }>>([])
  const [markerObjects, setMarkerObjects] = useState<google.maps.Marker[]>([])
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Cargar territorios desde la base de datos
  useEffect(() => {
    if (territories && territories.length > 0) {
      const loadedPolygons = territories.map(t => ({
        id: t._id,
        _id: t._id,
        coordinates: t.coordinates[0] || [], // Tomar el primer anillo (exterior)
        color: t.color || '#3B82F6',
        userId: t.userId
      }))
      setPolygons(loadedPolygons)
    }
  }, [territories])

  const filteredTerritories = (userId: string) => {
    if (!userId) return territories?.length || 0
    return territories?.filter((territory) => territory.userId === userId).length || 0
  }

  // Helper: Convertir Coordinate[] a formato Turf GeoJSON Polygon
  const toTurfPolygon = useCallback((coordinates: Coordinate[]) => {
    const ring = coordinates.map(c => [c.lng, c.lat])
    // Asegurar que el polígono esté cerrado
    if (ring.length > 0) {
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push(first)
      }
    }
    return createPolygon([ring])
  }, [])

  // Helper: Convertir de Turf GeoJSON coords a Coordinate[]
  const fromTurfCoords = useCallback((coords: number[][][]) => {
    return coords.map(ring => {
      const r = ring.map((p: number[]) => ({ lat: p[1], lng: p[0] }))
      r.pop() // Remover punto de cierre
      return r
    })[0] // Devolver solo el primer anillo (sin huecos)
  }, [])

  // Limpiar polígono actual
  const clearCurrentPolygon = useCallback(() => {
    setCurrentPolygon([])
    markerObjects.forEach(marker => marker.setMap(null))
    setMarkerObjects([])
  }, [markerObjects])

  // Finalizar polígono
  const finishPolygon = useCallback(() => {
    if (currentPolygon.length >= 3) {
      const newPolygon = {
        id: Date.now().toString(),
        coordinates: [...currentPolygon],
        color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
        userId: selectedUser || undefined
      }

      // Procesar polígonos existentes para recortar los que intersectan
      let newPoly
      try {
        newPoly = toTurfPolygon(currentPolygon)
      } catch {
        // Error creando polígono, agregar sin procesar
        setPolygons(prev => [...prev, newPolygon])
        clearCurrentPolygon()
        setIsDrawing(false)
        return
      }

      const nextPolygons: typeof polygons = []
      let shouldAddNewPolygon = true // Flag para controlar si agregamos el nuevo polígono

      // Verificar intersecciones con polígonos existentes
      polygons.forEach(poly => {
        try {
          const existingPoly = toTurfPolygon(poly.coordinates)
          
          // Verificar si hay intersección
          const intersection = intersect(featureCollection([existingPoly, newPoly]))
          
          if (intersection) {
            // Detectar si el nuevo polígono está completamente dentro del existente
            const isNewPolyInsideExisting = booleanContains(existingPoly, newPoly)
            const isSameUser = poly.userId === newPolygon.userId
            
            if (isNewPolyInsideExisting && isSameUser && newPolygon.userId) {
              // Crear hueco: restar el nuevo polígono del existente
              const diff = difference(featureCollection([existingPoly, newPoly]))
              
              if (diff && diff.geometry.type === 'Polygon') {
                // El resultado es un polígono con hueco (múltiples anillos)
                const allRings = diff.geometry.coordinates
                const coordinates = allRings[0].map((p: number[]) => ({ lat: p[1], lng: p[0] }))
                coordinates.pop() // Remover punto de cierre
                
                nextPolygons.push({ ...poly, coordinates })
              } else {
                nextPolygons.push(poly)
              }
              shouldAddNewPolygon = false // No agregar el nuevo polígono como entidad separada
              return
            }
            
            // Comportamiento normal: recortar polígono existente
            const diff = difference(featureCollection([existingPoly, newPoly]))
            
            if (!diff) {
              // El polígono existente fue completamente consumido, no agregarlo
              return
            } else {
              if (diff.geometry.type === 'Polygon') {
                // Polígono modificado
                const newCoords = fromTurfCoords(diff.geometry.coordinates)
                nextPolygons.push({ ...poly, coordinates: newCoords })
              } else if (diff.geometry.type === 'MultiPolygon') {
                // Dividido en múltiples polígonos
                diff.geometry.coordinates.forEach((polyCoords: number[][][], idx: number) => {
                  const newCoords = fromTurfCoords(polyCoords)
                  nextPolygons.push({
                    ...poly,
                    id: `${poly.id}-split-${idx}`,
                    coordinates: newCoords
                  })
                })
              }
            }
          } else {
            // No hay intersección, mantener el polígono original
            nextPolygons.push(poly)
          }
        } catch {
          // En caso de error, mantener el polígono original
          nextPolygons.push(poly)
        }
      })

      // Agregar el nuevo polígono solo si no se creó un hueco
      if (shouldAddNewPolygon) {
        nextPolygons.push(newPolygon)
      }
      
      setPolygons(nextPolygons)
      clearCurrentPolygon()
      setIsDrawing(false)

      // Guardar en la base de datos
      if (shouldAddNewPolygon && selectedUser) {
        setIsSaving(true)
        createTerritory({
          name: `Territorio ${Date.now()}`,
          userId: selectedUser,
          coordinates: newPolygon.coordinates,
          color: newPolygon.color
        }).then(result => {
          if (result.success && result.id) {
            // Actualizar el ID temporal con el ID de la base de datos
            setPolygons(prev => prev.map(p => 
              p.id === newPolygon.id ? { ...p, _id: result.id, id: result.id } : p
            ))
            router.refresh()
          } else {
            alert('Error al guardar: ' + (result.error || 'Error desconocido'))
          }
          setIsSaving(false)
        }).catch(err => {
          alert('Error al guardar territorio: ' + err.message)
          setIsSaving(false)
        })
      }
    }
  }, [currentPolygon, clearCurrentPolygon, polygons, toTurfPolygon, fromTurfCoords, selectedUser])

  // Manejar clics en el mapa
  useEffect(() => {
    if (!map || !mapsLibrary) return

    const clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!isDrawing || !e.latLng) return
      
      const newPoint: Coordinate = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng()
      }

      setCurrentPolygon(prev => [...prev, newPoint])

      // Agregar marcador
      const marker = new google.maps.Marker({
        position: newPoint,
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: '#FF0000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2
        }
      })

      setMarkerObjects(prev => [...prev, marker])
    })

    return () => {
      google.maps.event.removeListener(clickListener)
    }
  }, [map, mapsLibrary, isDrawing])

  // Renderizar polígonos guardados
  useEffect(() => {
    if (!map || !mapsLibrary) return

    const polygonInstances: google.maps.Polygon[] = []

    polygons.forEach(poly => {
      const isEditing = editingPolygonId === poly.id
      
      // Crear polígono con edición nativa de Google Maps
      const polygonInstance = new google.maps.Polygon({
        paths: poly.coordinates,
        strokeColor: poly.color,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: poly.color,
        fillOpacity: 0.35,
        map: map,
        editable: isEditing,
        draggable: false,
        clickable: !isDrawing // No clickeable cuando estamos dibujando
      })

      // Click en polígono para seleccionarlo para editar
      if (!isDrawing) {
        polygonInstance.addListener('click', (e: google.maps.PolyMouseEvent) => {
          // Detener la propagación del evento para que no llegue al mapa
          if (e.domEvent) {
            e.domEvent.stopPropagation()
          }
          setEditingPolygonId(poly.id)
        })
      }

      // Si está en edición, escuchar cambios en el path
      if (isEditing) {
        const path = polygonInstance.getPath()
        
        // Guardar cambios cuando se modifica el polígono
        const updatePolygonCoords = () => {
          const newCoordinates: Coordinate[] = []
          for (let i = 0; i < path.getLength(); i++) {
            const point = path.getAt(i)
            newCoordinates.push({
              lat: point.lat(),
              lng: point.lng()
            })
          }
          
          setPolygons(prevPolygons => 
            prevPolygons.map(p => 
              p.id === poly.id 
                ? { ...p, coordinates: newCoordinates }
                : p
            )
          )

          // Guardar en la base de datos si tiene _id
          if (poly._id) {
            updateTerritory(poly._id, newCoordinates).then(() => {
              router.refresh()
            })
          }
        }

        // Eventos para detectar cambios
        google.maps.event.addListener(path, 'set_at', updatePolygonCoords)
        google.maps.event.addListener(path, 'insert_at', updatePolygonCoords)
        google.maps.event.addListener(path, 'remove_at', updatePolygonCoords)

        // Agregar listener para clic derecho en el polígono para eliminar vértices
        polygonInstance.addListener('rightclick', (e: google.maps.PolyMouseEvent) => {
          // Verificar que sea un vértice (no una arista)
          if (e.vertex !== undefined && e.vertex !== null) {
            // No permitir eliminar si quedan menos de 4 puntos (mínimo 3 para un polígono)
            if (path.getLength() > 3) {
              path.removeAt(e.vertex)
            }
          }
        })
      }

      polygonInstances.push(polygonInstance)
    })

    return () => {
      polygonInstances.forEach(poly => {
        google.maps.event.clearInstanceListeners(poly)
        if (poly.getPath()) {
          google.maps.event.clearInstanceListeners(poly.getPath())
        }
        poly.setMap(null)
      })
    }
  }, [map, mapsLibrary, polygons, editingPolygonId, isDrawing])

  // Renderizar polígono actual (preview)
  useEffect(() => {
    if (!map || !mapsLibrary || currentPolygon.length < 2) return

    const previewPolygon = new google.maps.Polygon({
      paths: currentPolygon,
      strokeColor: '#FF0000',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#FF0000',
      fillOpacity: 0.15,
      map: map
    })

    return () => {
      previewPolygon.setMap(null)
    }
  }, [map, mapsLibrary, currentPolygon])

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 shadow-sm space-y-2">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label htmlFor="user">Usuarios:</label>
            <select
              id="user"
              name="user"
              className="ml-2 p-1 border rounded"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
            >
              <option value="">Todos los usuarios</option>
              {users.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>

          <span className="text-sm">
            Territorios: {filteredTerritories(selectedUser)}
          </span>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!selectedUser && !isDrawing) return
                setIsDrawing(!isDrawing)
                if (isDrawing) {
                  clearCurrentPolygon()
                } else {
                  setEditingPolygonId(null)
                }
              }}
              disabled={!selectedUser && !isDrawing}
              className={`px-4 py-1 rounded ${isDrawing ? 'bg-red-500 text-white' : selectedUser ? 'bg-blue-500 text-white' : 'bg-gray-400 text-gray-200 cursor-not-allowed'}`}
            >
              {isDrawing ? 'Cancelar' : 'Dibujar Polígono'}
            </button>

            {isDrawing && currentPolygon.length >= 3 && (
              <button
                onClick={finishPolygon}
                className="px-4 py-1 bg-green-500 text-white rounded"
              >
                Finalizar ({currentPolygon.length} puntos)
              </button>
            )}

            {editingPolygonId && (
              <button
                onClick={() => setEditingPolygonId(null)}
                className="px-4 py-1 bg-yellow-500 text-white rounded"
              >
                Terminar Edición
              </button>
            )}

            {polygons.length > 0 && (
              <button
                onClick={async () => {
                  const idsToDelete = polygons.filter(p => p._id).map(p => p._id!)
                  setPolygons([])
                  clearCurrentPolygon()
                  setEditingPolygonId(null)
                  
                  // Eliminar de la base de datos
                  if (idsToDelete.length > 0) {
                    const { deleteTerritories } = await import('../app/actions/territories')
                    await deleteTerritories(idsToDelete)
                  }
                }}
                disabled={isSaving}
                className="px-4 py-1 bg-gray-500 text-white rounded disabled:opacity-50"
              >
                Limpiar Todo ({polygons.length})
              </button>
            )}
          </div>
        </div>

        {isSaving && (
          <div className="text-sm text-blue-600 font-medium">
            💾 Guardando territorio...
          </div>
        )}

        {!selectedUser && !isDrawing && (
          <div className="text-sm text-amber-600 font-medium">
            ⚠️ Selecciona un usuario para poder dibujar polígonos.
          </div>
        )}

        {isDrawing && (
          <div className="text-sm text-gray-600">
            Haz clic en el mapa para agregar puntos. Mínimo 3 puntos para formar un polígono.
          </div>
        )}

        {editingPolygonId && (
          <div className="text-sm text-blue-600 font-medium">
            Modo edición: Arrastra los puntos para moverlos, arrastra los puntos semi-transparentes para agregar nuevos vértices. Haz clic en &quot;Terminar Edición&quot; para finalizar.
          </div>
        )}
      </div>
      <div className="flex-1">
        <GoogleMaps
          defaultCenter={{ lat: 20.6767, lng: -103.3475 }}
          defaultZoom={15}
          gestureHandling='greedy'
          disableDefaultUI
        />
      </div>
    </div>
  )
}

export default function Map({ users, territories }: Map) {
  const [selectedUser, setSelectedUser] = useState<string>('')

  return (
    <APIProvider apiKey={API_KEY}>
      <MapContent 
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        users={users} 
        territories={territories}
      />
    </APIProvider>
  )
}
