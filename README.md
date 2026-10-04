# Escaparate

App web instalable (iOS y Android) para preparar fotos de Wallapop y Vinted. Diseñada y programada por Ángel Muñiz.

## Qué hace
- Mejora luz, color y nitidez de forma automática (intensidad ajustable).
- Encuadra a 1:1 (Wallapop) o 3:4 vertical (Vinted), a 1600 px.
- Tres fondos: Original, Difuminado (foto entera sin recortar) y Estudio (quita el fondo con IA y pone un fondo de estudio con sombra).
- Archivo nuevo en cada foto: sin EXIF ni GPS, y variación mínima de encuadre, color y grano en cada versión.
- Retocar: todo se procesa en el móvil y ninguna foto sale del dispositivo.
- Rehacer con IA: genera una foto nueva de la prenda (de tienda o puesta en chica o chico, con cuerpo, encuadre y escenario a elegir) a partir de tu foto.
- Android: aparece en «Compartir» de la galería una vez instalada.

## Publicarla gratis (GitHub Pages)
1. Crea el repositorio `escaparate` en github.com/angelmunizpedraza.
2. Sube todo el contenido de esta carpeta a la raíz (index.html, sw.js, manifest.webmanifest, icons/).
3. Settings → Pages → Branch `main`, carpeta `/ (root)` → Save.
4. Abre https://angelmunizpedraza.github.io/escaparate/
   - iPhone: Safari → Compartir → Añadir a pantalla de inicio.
   - Android: Chrome → menú → Instalar aplicación.

La primera vez que uses «Estudio» se descargan unos 40 MB del modelo; queda guardado y después funciona sin conexión.

## Rehacer con IA (gratis, en tu cuenta de Cloudflare)
Modelo: FLUX.2 [klein] en Cloudflare Workers AI. Capa gratuita de 10.000 neuronas al día: unas 90 fotos en calidad rápida (klein 4B) o unas 7 en calidad alta (klein 9B). Sin tarjeta.

Montaje, una sola vez (10 minutos, desde el navegador):
1. Crea cuenta gratis en dash.cloudflare.com.
2. Workers y Pages → Crear → Worker → nómbralo `escaparate-ia` → Desplegar → Editar código → pega `worker/worker.js` → Desplegar.
3. En el Worker → Configuración → Enlaces (Bindings) → Añadir → Workers AI → nombre `AI`.
4. Configuración → Variables y secretos:
   - `APP_KEY` (tipo Secreto): una clave larga inventada por ti.
   - `ALLOWED_ORIGINS` (texto): `https://angelmunizpedraza.github.io`
5. Copia la dirección del Worker (https://escaparate-ia.TU-CUENTA.workers.dev).
6. En la app: Rehacer con IA → Conectar → pega dirección y clave → Probar → Guardar.

Con CLI, alternativa: `cd worker && npx wrangler deploy && npx wrangler secret put APP_KEY`.

Los textos de las instrucciones al modelo están en `worker/worker.js` (buildPrompt). Se pueden afinar sin tocar la app.

## Modelo de recorte de fondo
Recorte de fondo con @imgly/background-removal 1.7.0 (modelo ISNet cuantizado, gratuito, se ejecuta en el dispositivo con ONNX Runtime Web). Licencia AGPL-3.0: para uso propio no hay problema; si algún día la vendes como producto cerrado, hay que revisar la licencia o cambiar de modelo.
