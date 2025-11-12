// Inicializar mapa
const map = L.map('map', { zoomControl: false }).setView([-12.0464, -77.0428], 12);

L.control.zoom({ position: 'bottomright' }).addTo(map);
map.getPane('tooltipPane').style.zIndex = 9999;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

// Variables globales
const layerGroups = {};
const layerCounts = {};
let allMarkers = [];
let allFeatures = [];
let minDate, maxDate;
let isPlaying = false;
let playInterval;
let userLocationMarker = null;
const geoJsonUrl = 'ubicaciones_extraidas.geojson';

// Configuración de tipos de eventos
const eventTypes = {
    'delito': { icon: '🚨', name: 'Delito/Seguridad', color: 'marker-delito' },
    'accidente': { icon: '🚗', name: 'Accidente', color: 'marker-accidente' },
    'protesta': { icon: '📢', name: 'Protesta', color: 'marker-protesta' },
    'inauguracion': { icon: '🎉', name: 'Inauguración', color: 'marker-inauguracion' },
    'emergencia': { icon: '🚒', name: 'Emergencia', color: 'marker-emergencia' },
    'obra': { icon: '🏗️', name: 'Obra/Construcción', color: 'marker-obra' },
    'politica': { icon: '🏛️', name: 'Política', color: 'marker-politica' },
    'salud': { icon: '⚕️', name: 'Salud', color: 'marker-salud' },
    'educacion': { icon: '📚', name: 'Educación', color: 'marker-educacion' },
    'otro': { icon: '📍', name: 'Otro', color: 'marker-otro' }
};

function clasificarEvento(tipo) {
    if (!tipo) return 'otro';
    const tipoNormalizado = tipo.toLowerCase().trim();
    if (eventTypes[tipoNormalizado]) return tipoNormalizado;
    for (const key of Object.keys(eventTypes)) {
        if (tipoNormalizado.includes(key) || key.includes(tipoNormalizado)) return key;
    }
    return 'otro';
}

function crearIcono(tipoEvento) {
    const tipo = clasificarEvento(tipoEvento);
    const config = eventTypes[tipo] || eventTypes.otro;
    return L.divIcon({ 
        className: 'custom-div-icon',
        html: `<div class="custom-marker ${config.color}">${config.icon}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
    });
}

function crearTooltip(props, featureIndex) {
    const ubicacion = props.ubicacion || 'N/A';
    const evento = props.tipo_evento || 'N/A';
    const contexto = props.contexto || 'Sin contexto disponible';
    const fecha = props.fecha || 'Sin fecha';
    const medio = props.medio || 'Desconocido';
    const actores = props.actores || 'N/A';

    return `
        <div class="tooltip-header">📍 ${ubicacion}</div>
        <div class="tooltip-body">
            <div class="tooltip-row">
                <strong>Tipo:</strong>
                <span class="badge ${evento.toLowerCase()}">${evento}</span>
            </div>
            <div class="tooltip-row">
                <strong>Actores:</strong>
                <span>${actores}</span>
            </div>
            <div class="tooltip-contexto">${contexto}</div>
            <div class="tooltip-footer">
                <strong>Fuente:</strong> ${medio} • <strong>Fecha:</strong> ${fecha}
            </div>
            <div class="tooltip-share">
                <button class="tooltip-share-btn whatsapp" onclick="compartirEvento(${featureIndex}, 'whatsapp')" title="WhatsApp">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                </button>
                <button class="tooltip-share-btn facebook" onclick="compartirEvento(${featureIndex}, 'facebook')" title="Facebook">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                </button>
                <button class="tooltip-share-btn twitter" onclick="compartirEvento(${featureIndex}, 'twitter')" title="X">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                </button>
                <button class="tooltip-share-btn copy" onclick="copiarEnlaceEvento(${featureIndex})" title="Copiar">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

// Funciones de control de capas
function updateActiveCount() {
    const activeCount = Object.values(layerGroups).filter(g => map.hasLayer(g)).length;
    const totalCount = Object.keys(layerGroups).length;
    document.getElementById('active-count').textContent = `${activeCount}/${totalCount}`;
    
    let visibleMarkers = 0;
    Object.keys(layerGroups).forEach(tipo => {
        if (map.hasLayer(layerGroups[tipo])) visibleMarkers += layerCounts[tipo] || 0;
    });
    document.getElementById('stats').innerHTML = `${visibleMarkers} eventos visibles`;
}

function toggleLayer(tipo, checkbox) {
    if (checkbox.checked) {
        map.addLayer(layerGroups[tipo]);
    } else {
        map.removeLayer(layerGroups[tipo]);
    }
    updateActiveCount();
}

function toggleAllLayers(show) {
    Object.keys(layerGroups).forEach(tipo => {
        const checkbox = document.getElementById(`layer-${tipo}`);
        if (checkbox) {
            checkbox.checked = show;
            if (show) map.addLayer(layerGroups[tipo]);
            else map.removeLayer(layerGroups[tipo]);
        }
    });
    updateActiveCount();
}

function createLayerControl() {
    const container = document.getElementById('layer-items');
    container.innerHTML = '';
    
    const sortedTypes = Object.keys(layerCounts).sort((a, b) => layerCounts[b] - layerCounts[a]);
    
    sortedTypes.forEach(tipo => {
        const config = eventTypes[tipo];
        if (!config) return;
        
        const count = layerCounts[tipo] || 0;
        const item = document.createElement('div');
        item.className = 'layer-item';
        item.innerHTML = `
            <input type="checkbox" id="layer-${tipo}" checked onchange="toggleLayer('${tipo}', this)">
            <span class="layer-item-icon">${config.icon}</span>
            <span class="layer-item-text">${config.name}</span>
            <span class="layer-item-count">${count}</span>
        `;
        container.appendChild(item);
    });
    
    updateActiveCount();
}

// Timeline
function parseDate(dateStr) {
    if (!dateStr) return null;
    try {
        const meses = {
            'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
            'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
            'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
        };
        
        const regexEspanol = /(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/i;
        const matchEspanol = dateStr.match(regexEspanol);
        
        if (matchEspanol) {
            const dia = parseInt(matchEspanol[1]);
            const mesNombre = matchEspanol[2].toLowerCase();
            const año = matchEspanol[3] ? parseInt(matchEspanol[3]) : new Date().getFullYear();
            
            if (meses.hasOwnProperty(mesNombre)) {
                return new Date(año, meses[mesNombre], dia);
            }
        }
        
        return new Date(dateStr);
    } catch (e) {
        console.error('Error parseando fecha:', dateStr, e);
        return null;
    }
}

function formatDate(date) {
    if (!date) return 'N/A';
    return date.toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function updateTimelineDisplay() {
    const slider = document.getElementById('timeline-slider');
    const dateDisplay = document.getElementById('timeline-date-display');
    const statsDisplay = document.getElementById('timeline-stats');
    
    if (!minDate || !maxDate) return;
    
    const percentage = slider.value / 100;
    const totalMs = maxDate - minDate;
    const currentMs = minDate.getTime() + (totalMs * percentage);
    const currentDate = new Date(currentMs);
    
    dateDisplay.textContent = percentage === 1 ? 'Todos los eventos' : formatDate(currentDate);
    
    let visibleCount = 0;
    allFeatures.forEach(feature => {
        const featureDate = parseDate(feature.properties.fecha);
        if (!featureDate) return;
        
        const tipo = clasificarEvento(feature.properties.tipo_evento);
        const marker = feature.marker;
        
        if (featureDate <= currentDate) {
            if (!layerGroups[tipo].hasLayer(marker)) layerGroups[tipo].addLayer(marker);
            visibleCount++;
        } else {
            if (layerGroups[tipo].hasLayer(marker)) layerGroups[tipo].removeLayer(marker);
        }
    });
    
    statsDisplay.textContent = `${visibleCount} eventos visibles`;
}

function resetTimeline() {
    document.getElementById('timeline-slider').value = 100;
    stopTimeline();
    updateTimelineDisplay();
}

function playTimeline() {
    const btn = document.getElementById('play-btn');
    const slider = document.getElementById('timeline-slider');
    
    if (isPlaying) {
        stopTimeline();
    } else {
        isPlaying = true;
        btn.innerHTML = '⏸️';
        
        if (slider.value >= 99) slider.value = 0;
        
        playInterval = setInterval(() => {
            slider.value = parseInt(slider.value) + 1;
            updateTimelineDisplay();
            if (slider.value >= 100) stopTimeline();
        }, 100);
    }
}

function stopTimeline() {
    isPlaying = false;
    document.getElementById('play-btn').innerHTML = '▶️';
    if (playInterval) clearInterval(playInterval);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('timeline-slider').addEventListener('input', () => {
        stopTimeline();
        updateTimelineDisplay();
    });
});

// Fullscreen
function toggleFullscreen() {
    const elem = document.documentElement;
    
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (elem.requestFullscreen) elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

['fullscreenchange', 'webkitfullscreenchange'].forEach(event => {
    document.addEventListener(event, () => {
        const btn = document.getElementById('fullscreen-btn');
        const isInFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
        
        if (isInFullscreen) {
            btn.classList.add('active');
            document.body.classList.add('fullscreen-mode');
        } else {
            btn.classList.remove('active');
            document.body.classList.remove('fullscreen-mode');
        }
        
        setTimeout(() => map.invalidateSize(), 100);
    });
});

// Geolocalización
function obtenerUbicacion() {
    const btn = document.getElementById('geolocation-btn');
    
    if (!navigator.geolocation) {
        alert('Tu navegador no soporta geolocalización');
        return;
    }

    btn.classList.add('loading');

    navigator.geolocation.getCurrentPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            if (userLocationMarker) map.removeLayer(userLocationMarker);

            const userIcon = L.divIcon({
                className: 'custom-div-icon',
                html: '<div class="user-location-marker"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            userLocationMarker = L.marker([lat, lng], { icon: userIcon })
                .addTo(map)
                .bindTooltip(`<div style="padding: 8px;"><strong>📍 Tu ubicación</strong><br><small>Precisión: ±${Math.round(accuracy)} metros</small></div>`, {
                    permanent: false,
                    direction: 'top'
                });

            map.setView([lat, lng], 15, { animate: true, duration: 1 });

            L.circle([lat, lng], {
                radius: accuracy,
                color: '#667eea',
                fillColor: '#667eea',
                fillOpacity: 0.1,
                weight: 1
            }).addTo(map);

            btn.classList.remove('loading');
            btn.classList.add('active');
        },
        error => {
            btn.classList.remove('loading');
            let mensaje = 'No se pudo obtener tu ubicación';
            if (error.code === error.PERMISSION_DENIED) {
                mensaje = 'Permiso de ubicación denegado';
            }
            alert(mensaje);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// Compartir
function generarEnlaceCompartir(eventoIndex = null) {
    const url = window.location.href.split('?')[0];
    const center = map.getCenter();
    const zoom = map.getZoom();
    let shareUrl = `${url}?lat=${center.lat.toFixed(5)}&lng=${center.lng.toFixed(5)}&zoom=${zoom}`;
    if (eventoIndex !== null) shareUrl += `&evento=${eventoIndex}`;
    return shareUrl;
}

function compartirEn(plataforma) {
    const url = generarEnlaceCompartir();
    const titulo = 'Mapa de Noticias - Lima, Perú';
    
    const links = {
        'whatsapp': `https://wa.me/?text=${encodeURIComponent(titulo + '\n' + url)}`,
        'facebook': `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        'twitter': `https://twitter.com/intent/tweet?text=${encodeURIComponent(titulo)}&url=${encodeURIComponent(url)}`,
        'telegram': `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(titulo)}`,
        'linkedin': `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
    };
    
    if (links[plataforma]) window.open(links[plataforma], '_blank', 'width=600,height=400');
}

function compartirEvento(eventoIndex, plataforma) {
    const feature = allFeatures[eventoIndex];
    if (!feature) return;
    
    const props = feature.properties;
    const url = generarEnlaceCompartir(eventoIndex);
    const titulo = `${props.tipo_evento || 'Evento'} en ${props.ubicacion || 'Lima'}`;
    
    const links = {
        'whatsapp': `https://wa.me/?text=${encodeURIComponent(titulo + '\n' + url)}`,
        'facebook': `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        'twitter': `https://twitter.com/intent/tweet?text=${encodeURIComponent(titulo)}&url=${encodeURIComponent(url)}`
    };
    
    if (links[plataforma]) window.open(links[plataforma], '_blank', 'width=600,height=400');
}

function copiarEnlace() {
    navigator.clipboard.writeText(generarEnlaceCompartir()).then(() => {
        const tooltip = document.getElementById('copy-tooltip');
        tooltip.classList.add('show');
        setTimeout(() => tooltip.classList.remove('show'), 2000);
    });
}

function copiarEnlaceEvento(eventoIndex) {
    navigator.clipboard.writeText(generarEnlaceCompartir(eventoIndex)).then(() => {
        const statusMsg = document.getElementById('status-message');
        statusMsg.innerHTML = '<strong>✅ Enlace copiado</strong>';
        statusMsg.style.display = 'block';
        setTimeout(() => statusMsg.style.display = 'none', 2000);
    });
}

// Búsqueda
let searchResults = [];

function highlightText(text, query) {
    if (!text || !query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
}

function realizarBusqueda() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    
    if (query.length < 2) {
        alert('Ingresa al menos 2 caracteres');
        return;
    }

    searchResults = [];
    
    allFeatures.forEach((feature, index) => {
        const ubicacion = (feature.properties.ubicacion || '').toLowerCase();
        const contexto = (feature.properties.contexto || '').toLowerCase();
        
        if (ubicacion.includes(query) || contexto.includes(query)) {
            searchResults.push({ feature, index, marker: feature.marker });
        }
    });

    mostrarResultados(query);
}

function mostrarResultados(query) {
    const resultsContainer = document.getElementById('search-results');
    const resultsList = document.getElementById('search-results-list');
    const resultsCount = document.getElementById('search-results-count');
    
    if (searchResults.length === 0) {
        resultsCount.textContent = 'No se encontraron resultados';
        resultsList.innerHTML = '<div style="padding: 10px; text-align: center; color: #999;">Intenta con otras palabras</div>';
        resultsContainer.classList.add('active');
        return;
    }

    resultsCount.textContent = `${searchResults.length} resultado${searchResults.length !== 1 ? 's' : ''}`;
    
    const maxResults = Math.min(searchResults.length, 10);
    let html = '';
    
    for (let i = 0; i < maxResults; i++) {
        const result = searchResults[i];
        const props = result.feature.properties;
        
        const ubicacion = highlightText(props.ubicacion || 'Sin ubicación', query);
        const contexto = props.contexto || 'Sin contexto';
        const contextoCorto = contexto.length > 100 ? contexto.substring(0, 100) + '...' : contexto;
        const contextoHighlight = highlightText(contextoCorto, query);
        
        html += `
            <div class="search-result-item" onclick="irAResultado(${i})">
                <div class="search-result-location">${ubicacion}</div>
                <div class="search-result-context">${contextoHighlight}</div>
            </div>
        `;
    }
    
    if (searchResults.length > 10) {
        html += `<div style="padding: 8px; text-align: center; color: #999; font-size: 11px;">Primeros 10 de ${searchResults.length} resultados</div>`;
    }
    
    resultsList.innerHTML = html;
    resultsContainer.classList.add('active');
}

function irAResultado(index) {
    if (!searchResults[index]) return;
    
    const result = searchResults[index];
    const coords = result.feature.geometry.coordinates;
    const marker = result.marker;
    
    map.setView([coords[1], coords[0]], 16, { animate: true, duration: 0.5 });
    
    setTimeout(() => marker.openTooltip(), 500);
}

function limpiarBusqueda() {
    document.getElementById('search-input').value = '';
    searchResults = [];
    cerrarResultados();
}

function cerrarResultados() {
    document.getElementById('search-results').classList.remove('active');
}

// Cargar datos
fetch(geoJsonUrl)
    .then(response => {
        if (!response.ok) throw new Error('Error al cargar GeoJSON');
        return response.json();
    })
    .then(data => {
        document.getElementById('loading').style.display = 'none';

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('lat') && urlParams.has('lng') && urlParams.has('zoom')) {
            map.setView([parseFloat(urlParams.get('lat')), parseFloat(urlParams.get('lng'))], parseInt(urlParams.get('zoom')));
        }

        Object.keys(eventTypes).forEach(tipo => {
            layerGroups[tipo] = L.markerClusterGroup({ maxClusterRadius: 60 });
            layerCounts[tipo] = 0;
        });

        let featureIndex = 0;
        data.features.forEach(feature => {
            const tipoClasificado = clasificarEvento(feature.properties.tipo_evento);
            layerCounts[tipoClasificado]++;
            
            const featureDate = parseDate(feature.properties.fecha);
            if (featureDate) {
                if (!minDate || featureDate < minDate) minDate = featureDate;
                if (!maxDate || featureDate > maxDate) maxDate = featureDate;
            }
            
            const marker = L.marker(
                [feature.geometry.coordinates[1], feature.geometry.coordinates[0]], 
                { icon: crearIcono(feature.properties.tipo_evento) }
            );
            
            marker.featureIndex = featureIndex;
            
            const tooltip = L.tooltip({
                className: 'custom-tooltip',
                direction: 'right',
                offset: [15, 0],
                opacity: 1,
                permanent: false,
                interactive: true
            }).setContent(crearTooltip(feature.properties, featureIndex));
            
            marker.bindTooltip(tooltip);
            
            // Control mejorado de apertura/cierre del tooltip
            let isTooltipHovered = false;
            let closeTimeout = null;
            
            marker.on('mouseover', function() {
                clearTimeout(closeTimeout);
                this.openTooltip();
            });
            
            marker.on('mouseout', function(e) {
                closeTimeout = setTimeout(() => {
                    if (!isTooltipHovered) {
                        this.closeTooltip();
                    }
                }, 300);
            });
            
            // Configurar eventos del tooltip después de que se renderice
            marker.on('tooltipopen', function() {
                setTimeout(() => {
                    const tooltipElement = this.getTooltip().getElement();
                    if (tooltipElement) {
                        tooltipElement.addEventListener('mouseenter', function() {
                            isTooltipHovered = true;
                            clearTimeout(closeTimeout);
                        });
                        
                        tooltipElement.addEventListener('mouseleave', function() {
                            isTooltipHovered = false;
                            marker.closeTooltip();
                        });
                    }
                }, 50);
            });
            
            marker.on('tooltipclose', function() {
                isTooltipHovered = false;
            });
            
            feature.marker = marker;
            feature.index = featureIndex;
            
            layerGroups[tipoClasificado].addLayer(marker);
            allMarkers.push(marker);
            allFeatures.push(feature);
            
            featureIndex++;
        });

        Object.values(layerGroups).forEach(group => map.addLayer(group));
        createLayerControl();

        if (minDate && maxDate) {
            document.getElementById('timeline-start-date').textContent = formatDate(minDate);
            document.getElementById('timeline-end-date').textContent = formatDate(maxDate);
            document.getElementById('timeline-stats').textContent = `${data.features.length} eventos`;
        }

        if (urlParams.has('evento')) {
            const eventoIndex = parseInt(urlParams.get('evento'));
            setTimeout(() => {
                if (allFeatures[eventoIndex]) {
                    const feature = allFeatures[eventoIndex];
                    const coords = feature.geometry.coordinates;
                    map.setView([coords[1], coords[0]], 18, { animate: true });
                    setTimeout(() => feature.marker.openTooltip(), 500);
                }
            }, 1000);
        }

        if (allMarkers.length > 0 && !urlParams.has('lat')) {
            const bounds = L.latLngBounds(allMarkers.map(m => m.getLatLng()));
            map.fitBounds(bounds);
        }
    })
    .catch(error => {
        console.error("Error:", error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error-message').innerHTML = `❌ ${error.message}`;
        document.getElementById('error-message').style.display = 'block';
    });