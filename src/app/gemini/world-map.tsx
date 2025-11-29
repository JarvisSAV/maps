'use client'
import React, { useEffect, useRef, useLayoutEffect } from 'react'
import * as L from 'leaflet'
import { GameState, Coordinate } from './types'

// Fix for default Leaflet marker icons in React/ESM environment
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png'
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png'
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
})

L.Marker.prototype.options.icon = DefaultIcon

// Custom small handle for editing vertices
const vertexHandleIcon = L.divIcon({
  className: 'bg-white border-2 border-amber-500 rounded-full shadow-sm cursor-move hover:scale-125 transition-transform',
  html: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6]
})

interface WorldMapProps {
  gameState: GameState;
  onMapClick: (coord: Coordinate) => void;
  onMarkerClick: (coord: Coordinate, isStart: boolean) => void;
  isEditMode: boolean;
  selectedTerritoryId: string | null;
  onTerritoryClick: (id: string) => void;
  onTerritoryUpdate: (id: string, newCoordinates: Coordinate[][]) => void;
}

export const WorldMap: React.FC<WorldMapProps> = ({
  gameState,
  onMapClick,
  onMarkerClick,
  isEditMode,
  selectedTerritoryId,
  onTerritoryClick,
  onTerritoryUpdate
}) => {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Refs to access latest state inside event callbacks - declared first
  const isEditModeRef = useRef(isEditMode)
  const onMapClickRef = useRef(onMapClick)
  const onTerritoryClickRef = useRef(onTerritoryClick)

  const layersRef = useRef<{
    activePath: L.Polyline | null;
    activeMarkers: (L.Marker | L.CircleMarker)[];
    territories: L.Polygon[];
    editMarkers: L.Marker[];
      }>
      (
      {
        activePath: null,
        activeMarkers: [],
        territories: [],
        editMarkers: []
      }
      )

  // Update refs synchronously before paint
  useLayoutEffect(() => {
    isEditModeRef.current = isEditMode
    onMapClickRef.current = onMapClick
    onTerritoryClickRef.current = onTerritoryClick
  })

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Center on Guadalajara
    mapRef.current = L.map(containerRef.current).setView(
      [gameState.mapCenter.lat, gameState.mapCenter.lng],
      gameState.zoom
    )

    // Dark/Night mode tiles for "Cyber" aesthetic
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(mapRef.current)

    mapRef.current.on('click', (e) => {
      // Only allow map clicks (adding points) if we are NOT in edit mode
      if (!isEditModeRef.current) {
        onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng })
      } else {
        // In edit mode, clicking empty space deselects
        onTerritoryClickRef.current('')
      }
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount

  // Handle Updates
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // 1. Clear previous layers
    if (layersRef.current.activePath) layersRef.current.activePath.remove()
    layersRef.current.activeMarkers.forEach(m => m.remove())
    layersRef.current.territories.forEach(p => p.remove())
    layersRef.current.editMarkers.forEach(m => m.remove())

    layersRef.current.activeMarkers = []
    layersRef.current.territories = []
    layersRef.current.editMarkers = []

    // 2. Render Territories
    gameState.territories.forEach(terr => {
      const owner = gameState.users[terr.ownerId]
      const isSelected = terr.id === selectedTerritoryId

      const baseColor = owner ? owner.fillColor : '#64748b'
      const color = isSelected ? '#fbbf24' : baseColor // Amber-400 for selection

      const latlngs = terr.coordinates.map(ring =>
        ring.map(c => [c.lat, c.lng] as L.LatLngExpression)
      )

      const polygon = L.polygon(
        latlngs,
        {
          color: isSelected ? '#fff' : color,
          fillColor: color,
          fillOpacity: isSelected ? 0.6 : 0.4,
          weight: isSelected ? 4 : 2,
          className: isEditMode ? 'cursor-pointer hover:opacity-80' : ''
        }
      ).addTo(map)

      // Handle Click on Polygon
      polygon.on('click', (e) => {
        if (isEditModeRef.current) {
          L.DomEvent.stopPropagation(e)
          onTerritoryClickRef.current(terr.id)
        }
      })

      layersRef.current.territories.push(polygon)

      // 2b. Render Draggable Edit Handles if Selected
      if (isSelected && isEditMode) {
        terr.coordinates.forEach((ring, ringIdx) => {
          ring.forEach((point, pointIdx) => {
            const marker = L.marker([point.lat, point.lng], {
              icon: vertexHandleIcon,
              draggable: true,
              zIndexOffset: 1000 // Ensure handles are on top
            }).addTo(map)

            // Real-time visual update during drag
            marker.on('drag', (e) => {
              const newLatLng = (e.target as L.Marker).getLatLng()

              // Update the specific point in the polygon's LatLngs structure
              // Leaflet stores latlngs as nested arrays of objects.
              // We get the current structure, modify the reference, and redraw.
              // Note: .getLatLngs() returns Array<Array<LatLng>> or Array<LatLng> or Array<Array<Array<LatLng>>> depending on complexity.
              // Since we construct it as Coordinate[][], it should be Array<Array<LatLng>> (Polygon with holes)
              const polyLatLngs = polygon.getLatLngs() as L.LatLng[][]

              // Safety check
              if (polyLatLngs[ringIdx] && polyLatLngs[ringIdx][pointIdx]) {
                polyLatLngs[ringIdx][pointIdx].lat = newLatLng.lat
                polyLatLngs[ringIdx][pointIdx].lng = newLatLng.lng
                polygon.setLatLngs(polyLatLngs) // Trigger redraw
              }
            })

            // Commit changes on drag end
            marker.on('dragend', (e) => {
              const newLatLng = (e.target as L.Marker).getLatLng()

              // Create a deep copy of coordinates to update state
              const newCoords = terr.coordinates.map(r => r.map(c => ({ ...c })))
              newCoords[ringIdx][pointIdx] = { lat: newLatLng.lat, lng: newLatLng.lng }

              onTerritoryUpdate(terr.id, newCoords)
            })

            layersRef.current.editMarkers.push(marker)
          })
        })
      }
    })

    // 3. Render Active Path (Drawing Mode)
    const pathCoords = gameState.activePath.map(c => [c.lat, c.lng] as L.LatLngExpression)

    if (pathCoords.length > 0) {
      const currentUserColor = gameState.currentUser.fillColor

      layersRef.current.activePath = L.polyline(pathCoords, {
        color: currentUserColor,
        dashArray: '10, 10',
        weight: 3,
        opacity: 0.8
      }).addTo(map)

      gameState.activePath.forEach((coord, idx) => {
        const isStart = idx === 0

        const marker = L.circleMarker([coord.lat, coord.lng], {
          radius: isStart ? 8 : 4,
          fillColor: isStart ? '#fff' : currentUserColor,
          color: currentUserColor,
          weight: 2,
          fillOpacity: 1
        }).addTo(map)

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          onMarkerClick(coord, isStart)
        })

        layersRef.current.activeMarkers.push(marker)
      })
    }

  }, [gameState, onMapClick, onMarkerClick, selectedTerritoryId, onTerritoryClick, isEditMode, onTerritoryUpdate])

  // Update view if location changes significantly
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.flyTo([gameState.mapCenter.lat, gameState.mapCenter.lng], gameState.zoom)
    }
  }, [gameState.mapCenter, gameState.zoom])

  return <div ref={containerRef} className={`w-full h-full ${isEditMode ? 'cursor-default' : 'cursor-crosshair'}`} />
}
