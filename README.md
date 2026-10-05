# Escaparate

App web instalable (iOS y Android) para preparar fotos de Wallapop y Vinted. Diseñada y programada por Ángel Muñiz.

## Qué hace
- **Anuncio completo** (modo principal): con las fotos de una prenda crea la portada puesta en modelo (GPT Image 2.5 con revisor de fidelidad), deja tus fotos reales recortadas con fondo de estudio y escribe título, descripción, estado y precio recomendado para Vinted o Wallapop, con avisos de defectos visibles y de las fotos que faltan.
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

## Rehacer con IA
Motor principal: GPT Image 2.5 en xKiro (fiel a la prenda, sin tope en la app). Reserva automática: FLUX.2 [klein] en Cloudflare Workers AI cuando xKiro no tiene saldo, limita o falla.

La clave de xKiro vive SOLO como secreto del Worker. Nunca en index.html, en worker.js ni en el repositorio: la web es pública y cualquiera la leería.

Montaje (desde el navegador):
1. dash.cloudflare.com → Workers y Pages → `escaparate-ia` → Editar código → pega `worker/worker.js` → Desplegar.
2. Configuración → Enlaces (Bindings): Workers AI con nombre `AI` (reserva).
3. Configuración → Variables y secretos:
   - `XKIRO_KEY` (tipo Secreto): tu clave de xKiro.
   - `APP_KEY` (tipo Secreto): la clave que pegas en la app.
   - `ALLOWED_ORIGINS` (texto): `https://angelmunizpedraza.github.io`
4. En la app: Rehacer con IA → Conectar → dirección del Worker y APP_KEY → Probar → Guardar.

Con CLI: `cd worker && npx wrangler deploy && npx wrangler secret put XKIRO_KEY && npx wrangler secret put APP_KEY`.

Los textos de las instrucciones al modelo están en `worker/worker.js` (buildPrompt).

## Modelo de recorte de fondo
Recorte de fondo con @imgly/background-removal 1.7.0 (modelo ISNet cuantizado, gratuito, se ejecuta en el dispositivo con ONNX Runtime Web). Licencia AGPL-3.0: para uso propio no hay problema; si algún día la vendes como producto cerrado, hay que revisar la licencia o cambiar de modelo.
