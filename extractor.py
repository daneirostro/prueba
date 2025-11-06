import spacy
import re
import csv
import time
import subprocess
from pathlib import Path
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from datetime import datetime

# Cargar modelo de spaCy en español
nlp = spacy.load("es_core_news_md")

# Inicializar geocodificador
geolocator = Nominatim(user_agent="peru_news_geolocator")

# Departamentos y ciudades principales del Perú
DEPARTAMENTOS_PERU = [
    'Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 
    'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco',
    'Ica', 'Junín', 'La Libertad', 'Lambayeque', 'Lima',
    'Loreto', 'Madre de Dios', 'Moquegua', 'Pasco', 'Piura',
    'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali'
]

CIUDADES_PRINCIPALES = [
    'Trujillo', 'Chiclayo', 'Iquitos', 'Piura', 'Cusco',
    'Arequipa', 'Huancayo', 'Tacna', 'Ica', 'Pucallpa',
    'Chimbote', 'Juliaca', 'Tarapoto', 'Huaraz', 'Cajamarca'
]

# Patrones para detectar direcciones
DIRECCION_PATTERNS = [
    r'(?:Av\.|Avenida|Jr\.|Jirón|Calle|Ca\.|Psje\.|Pasaje)\s+[A-ZÁÉÍÓÚÑa-záéíóúñ\s\.]+(?:\s+(?:cdra\.|cuadra)\s+\d+)?',
    r'(?:cruce|esquina|intersección)\s+(?:de\s+)?[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+\s+(?:con|y)\s+[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+',
]

# Keywords para clasificación de eventos
EVENTOS = {
    'accidente': ['choque', 'atropello', 'colisión', 'accidente', 'impacto', 'despiste'],
    'delito': ['robo', 'asalto', 'hurto', 'asesinato', 'homicidio', 'balacera', 'sicario', 'delincuente'],
    'protesta': ['marcha', 'manifestación', 'paro', 'protesta', 'bloqueo', 'plantón'],
    'inauguracion': ['inauguró', 'inauguración', 'abrió', 'apertura', 'estreno', 'presentó'],
    'emergencia': ['incendio', 'explosión', 'derrumbe', 'deslizamiento', 'inundación', 'sismo'],
    'obra': ['construcción', 'edificación', 'obra', 'proyecto', 'remodelación'],
}

# Archivo de checkpoint
CHECKPOINT_FILE = '.procesamiento_checkpoint.txt'

def ejecutar_comando_git(comando):
    """Ejecuta un comando git y devuelve el resultado"""
    try:
        resultado = subprocess.run(
            comando,
            capture_output=True,
            text=True,
            shell=True,
            check=True
        )
        return True, resultado.stdout
    except subprocess.CalledProcessError as e:
        return False, e.stderr

def git_push_automatico(archivo_csv, mensaje_commit=None):
    """Hace commit y push automático del CSV a GitHub"""
    
    # Verificar si estamos en un repositorio git
    exito, _ = ejecutar_comando_git('git rev-parse --is-inside-work-tree')
    
    if not exito:
        print("\n⚠️  Este directorio no es un repositorio Git")
        print("   Para habilitar auto-push, inicializa Git:")
        print("   1. git init")
        print("   2. git remote add origin https://github.com/tu-usuario/tu-repo.git")
        return False
    
    print("\n🔄 Subiendo cambios a GitHub...")
    
    # Añadir el archivo CSV
    exito, salida = ejecutar_comando_git(f'git add {archivo_csv}')
    if not exito:
        print(f"❌ Error al añadir archivo: {salida}")
        return False
    
    # Crear mensaje de commit
    if not mensaje_commit:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        mensaje_commit = f"Actualización automática de datos - {timestamp}"
    
    # Hacer commit
    exito, salida = ejecutar_comando_git(f'git commit -m "{mensaje_commit}"')
    if not exito:
        # Si no hay cambios, no es un error
        if "nothing to commit" in salida or "no changes added" in salida:
            print("ℹ️  No hay cambios nuevos para subir")
            return True
        print(f"❌ Error al hacer commit: {salida}")
        return False
    
    # Hacer push
    print("   Subiendo a GitHub...")
    exito, salida = ejecutar_comando_git('git push')
    if not exito:
        print(f"❌ Error al hacer push: {salida}")
        print("\n💡 Tip: Verifica que hayas configurado:")
        print("   - git remote add origin <tu-url-repo>")
        print("   - Tus credenciales de GitHub")
        return False
    
    print("✅ Cambios subidos exitosamente a GitHub!")
    print("   Tu mapa se actualizará en unos segundos en GitHub Pages")
    return True

def leer_checkpoint():
    """Lee el número de la última fila procesada"""
    try:
        with open(CHECKPOINT_FILE, 'r') as f:
            return int(f.read().strip())
    except FileNotFoundError:
        return 0

def guardar_checkpoint(numero_fila):
    """Guarda el número de la última fila procesada"""
    with open(CHECKPOINT_FILE, 'w') as f:
        f.write(str(numero_fila))

def extraer_fecha(texto):
    """Extrae fecha del texto en varios formatos comunes"""
    patrones_fecha = [
        r'\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?\d{4}',
        r'\d{1,2}/\d{1,2}/\d{4}',
        r'\d{4}-\d{2}-\d{2}',
    ]
    
    for patron in patrones_fecha:
        match = re.search(patron, texto, re.IGNORECASE)
        if match:
            return match.group(0)
    return "Fecha no encontrada"

def extraer_direcciones(texto):
    """Extrae direcciones usando patrones regex"""
    direcciones = []
    for patron in DIRECCION_PATTERNS:
        matches = re.finditer(patron, texto, re.IGNORECASE)
        for match in matches:
            direcciones.append(match.group(0).strip())
    return direcciones

def clasificar_evento(texto):
    """Clasifica el tipo de evento basado en keywords"""
    texto_lower = texto.lower()
    
    for tipo, keywords in EVENTOS.items():
        for keyword in keywords:
            if keyword in texto_lower:
                return tipo
    
    return "otro"

def detectar_contexto_geografico(texto):
    """Detecta menciones de departamentos o ciudades en el texto"""
    texto_lower = texto.lower()
    
    # Buscar departamentos
    for depto in DEPARTAMENTOS_PERU:
        patrones = [
            f"en {depto.lower()}",
            f"de {depto.lower()}",
            f"región {depto.lower()}",
            f"departamento de {depto.lower()}",
        ]
        for patron in patrones:
            if patron in texto_lower:
                return depto
    
    # Buscar ciudades principales
    for ciudad in CIUDADES_PRINCIPALES:
        patrones = [
            f"en {ciudad.lower()}",
            f"de {ciudad.lower()}",
            f"ciudad de {ciudad.lower()}",
        ]
        for patron in patrones:
            if patron in texto_lower:
                return ciudad
    
    return None

def obtener_contexto(doc, ubicacion_idx):
    """Extrae el contexto (oración y verbo/sujeto) alrededor de una ubicación"""
    token = doc[ubicacion_idx]
    oracion = token.sent.text.strip()
    
    # Buscar verbo principal
    verbo = None
    sujeto = None
    
    for t in token.sent:
        if t.pos_ == "VERB" and t.dep_ in ["ROOT", "ccomp", "xcomp"]:
            verbo = t.text
            # Buscar sujeto del verbo
            for child in t.children:
                if child.dep_ in ["nsubj", "nsubjpass"]:
                    sujeto = child.text
                    break
            break
    
    return {
        'oracion': oracion,
        'verbo': verbo,
        'sujeto': sujeto
    }

def geocodificar(ubicacion, contexto_geografico=None):
    """Geocodifica una ubicación usando Nominatim con contexto geográfico"""
    try:
        # Determinar el contexto geográfico
        if contexto_geografico:
            query = f"{ubicacion}, {contexto_geografico}, Perú"
        else:
            # Por defecto, asumir Lima para direcciones específicas
            # (Av., Jr., Calle) y Perú para topónimos generales
            es_direccion = any(palabra in ubicacion.lower() 
                             for palabra in ['avenida', 'av.', 'jirón', 'jr.', 'calle', 'ca.', 'pasaje', 'psje.'])
            
            if es_direccion:
                query = f"{ubicacion}, Lima, Perú"
            else:
                query = f"{ubicacion}, Perú"
        
        time.sleep(1)  # Respetar rate limit de Nominatim
        
        location = geolocator.geocode(query, timeout=10)
        
        if location:
            return location.latitude, location.longitude
        else:
            return "desconocido", "desconocido"
    
    except (GeocoderTimedOut, GeocoderServiceError):
        return "desconocido", "desconocido"

def procesar_texto(texto, medio, numero_fila):
    """Procesa un texto y extrae toda la información georreferenciada"""
    resultados = []
    
    # Extraer metadata
    fecha = extraer_fecha(texto)
    tipo_evento = clasificar_evento(texto)
    
    # Detectar contexto geográfico del texto completo
    contexto_geografico = detectar_contexto_geografico(texto)
    
    # Procesar con spaCy
    doc = nlp(texto)
    
    # Extraer entidades de ubicación (LOC)
    ubicaciones_ner = []
    for ent in doc.ents:
        if ent.label_ == "LOC":
            ubicaciones_ner.append((ent.text, ent.start))
    
    # Extraer direcciones con regex
    direcciones = extraer_direcciones(texto)
    
    # Combinar ubicaciones (eliminar duplicados)
    todas_ubicaciones = set([u[0] for u in ubicaciones_ner] + direcciones)
    
    # Procesar cada ubicación
    for ubicacion in todas_ubicaciones:
        # Geocodificar con contexto geográfico
        lat, lon = geocodificar(ubicacion, contexto_geografico)
        
        # Buscar contexto (solo para ubicaciones detectadas por NER)
        contexto_info = None
        actores = ""
        
        for ub_texto, ub_idx in ubicaciones_ner:
            if ub_texto == ubicacion:
                contexto_info = obtener_contexto(doc, ub_idx)
                actores = contexto_info['sujeto'] if contexto_info['sujeto'] else ""
                break
        
        # Si no hay contexto de NER, usar oración que contiene la ubicación
        if not contexto_info:
            for sent in doc.sents:
                if ubicacion.lower() in sent.text.lower():
                    contexto_info = {'oracion': sent.text.strip(), 'verbo': None, 'sujeto': None}
                    break
        
        oracion = contexto_info['oracion'] if contexto_info else ""
        
        resultados.append({
            'id_fila': numero_fila,
            'ubicacion': ubicacion,
            'latitud': lat,
            'longitud': lon,
            'tipo_evento': tipo_evento,
            'actores': actores,
            'contexto': oracion,
            'fecha': fecha,
            'medio': medio,
            'fila_fuente': numero_fila
        })
    
    return resultados

def procesar_csv(archivo_entrada='fuente_noticias.csv', archivo_salida='ubicaciones_extraidas.csv'):
    """Procesa filas nuevas del CSV de entrada"""
    
    # Verificar que existe el archivo de entrada
    if not Path(archivo_entrada).exists():
        print(f"❌ Error: No se encuentra el archivo '{archivo_entrada}'")
        print(f"   Crea un CSV con las columnas: medio, texto")
        return
    
    # Leer checkpoint
    ultima_fila_procesada = leer_checkpoint()
    print(f"📍 Última fila procesada: {ultima_fila_procesada}")
    
    # Leer CSV de entrada - intentar diferentes codificaciones
    filas_nuevas = []
    codificaciones = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
    
    encoding_usado = None
    for encoding in codificaciones:
        try:
            with open(archivo_entrada, 'r', encoding=encoding) as f:
                # Detectar automáticamente el delimitador
                muestra = f.read(1024)
                f.seek(0)
                sniffer = csv.Sniffer()
                try:
                    delimitador = sniffer.sniff(muestra).delimiter
                except:
                    delimitador = ','  # Por defecto usar coma
                
                reader = csv.DictReader(f, delimiter=delimitador)
                
                # Leer todas las filas
                todas_filas = list(reader)
                
                # Debug: mostrar nombres de columnas detectados
                if not encoding_usado:
                    print(f"✓ Archivo leído correctamente con codificación: {encoding}")
                    print(f"✓ Delimitador detectado: '{delimitador}'")
                    print(f"📋 Columnas detectadas: {reader.fieldnames}")
                    encoding_usado = encoding
                
                for i, fila in enumerate(todas_filas, start=1):
                    if i > ultima_fila_procesada:
                        filas_nuevas.append((i, fila))
            break
        except UnicodeDecodeError:
            if encoding == codificaciones[-1]:
                print(f"❌ Error: No se pudo leer el archivo con ninguna codificación estándar")
                return
            continue
    
    if not filas_nuevas:
        print("✓ No hay filas nuevas para procesar")
        return
    
    print(f"🔄 Procesando {len(filas_nuevas)} filas nuevas...")
    
    # Determinar si el archivo de salida existe
    archivo_existe = Path(archivo_salida).exists()
    
    # Abrir archivo de salida en modo append
    with open(archivo_salida, 'a', newline='', encoding='utf-8') as f:
        campos = ['id_fila', 'ubicacion', 'latitud', 'longitud', 'tipo_evento', 
                 'actores', 'contexto', 'fecha', 'medio', 'fila_fuente']
        writer = csv.DictWriter(f, fieldnames=campos)
        
        # Escribir encabezado solo si el archivo es nuevo
        if not archivo_existe:
            writer.writeheader()
        
        total_ubicaciones = 0
        
        # Procesar cada fila nueva
        for numero_fila, fila in filas_nuevas:
            medio = fila.get('medio', 'Desconocido').strip()
            texto = fila.get('texto', '').strip()
            
            # Debug: mostrar qué se está leyendo
            print(f"  📄 Fila {numero_fila}:")
            print(f"     Medio: '{medio}'")
            print(f"     Texto (primeros 50 chars): '{texto[:50]}...'")
            
            if not texto:
                print(f"    ⚠ Texto vacío, omitiendo...")
                continue
            
            print(f"  Procesando fila {numero_fila} ({medio})...")
            
            resultados = procesar_texto(texto, medio, numero_fila)
            
            if resultados:
                writer.writerows(resultados)
                total_ubicaciones += len(resultados)
                print(f"    → {len(resultados)} ubicaciones extraídas")
            else:
                print(f"    → No se encontraron ubicaciones")
            
            # Guardar checkpoint después de cada fila procesada
            guardar_checkpoint(numero_fila)
    
    print(f"\n✓ Procesamiento completado!")
    print(f"✓ Filas procesadas: {len(filas_nuevas)}")
    print(f"✓ Total ubicaciones extraídas: {total_ubicaciones}")
    print(f"✓ Resultados guardados en: {archivo_salida}")
    print(f"✓ Checkpoint actualizado: fila {filas_nuevas[-1][0]}")
    
    # Auto-push a GitHub si está configurado
    git_push_automatico(archivo_salida)

if __name__ == "__main__":
    # CONFIGURACIÓN
    ARCHIVO_ENTRADA = "fuente_noticias.csv"  # CSV con columnas: medio, texto
    ARCHIVO_SALIDA = "ubicaciones_extraidas.csv"  # CSV de resultados
    
    print("=" * 60)
    print("  EXTRACTOR DE INFORMACIÓN GEORREFERENCIADA")
    print("  Noticias de Perú → Mapa automático")
    print("=" * 60)
    
    procesar_csv(ARCHIVO_ENTRADA, ARCHIVO_SALIDA)