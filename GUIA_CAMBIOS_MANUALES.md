# Guia de cambios manuales

Esta guia te dice **que archivo tocar** segun el cambio que quieras hacer en tu app `Creditos CB`.

Proyecto:

`C:\Users\pc\Documents\Codex\2026-04-19-act-a-como-un-desarrollador-full`

## 1. Si quieres cambiar colores de la app

Archivo principal:

`app/globals.css`

Tambien revisar:

`app/page.tsx`

Que se cambia ahi:

- colores de fondo
- botones
- tarjetas
- sombras
- bordes
- tipografia visual

## 2. Si quieres cambiar el logo

Revisar:

`app/page.tsx`

Si el logo es una imagen local, tambien revisar la carpeta:

`public`

Que se cambia ahi:

- imagen mostrada en login
- imagen en encabezado
- tamaño del logo
- bordes y estilo visual del logo

## 3. Si quieres cambiar textos visibles

Archivo principal:

`app/page.tsx`

Ejemplos:

- nombres de botones
- mensajes de error
- etiquetas de formularios
- titulos de pestañas
- textos del dashboard

## 4. Si quieres cambiar el usuario o la clave de acceso

Revisar:

`.env.local`

Variables importantes:

- `APP_USERNAME`
- `APP_PASSWORD`
- `AUTH_SESSION_SECRET`

Si ya activaste el cambio de clave desde la app con Supabase, tambien revisar:

- `app/api/auth/change-password/route.ts`
- `SUPABASE_CREDENCIALES_APP.sql`

## 5. Si quieres cambiar el porcentaje del prestamo

Archivo principal:

`app/page.tsx`

Que revisar:

- formulario de creacion de prestamo
- formulario de edicion de prestamo
- campo del porcentaje o interes

Nota:

La tabla de `prestamos` en Supabase tiene columnas generadas. Por eso el frontend no debe forzar manualmente `total_a_pagar` ni `valor_cuota` si la base de datos ya las calcula.

## 6. Si quieres cambiar el tiempo de borrado automatico

Archivo principal:

`app/api/maintenance/cleanup/route.ts`

Que revisar:

- logica del corte de fechas
- cantidad de tiempo a conservar
- eliminacion de clientes, prestamos y pagos antiguos

Actualmente:

- se conserva 1 ano de historial

Si algun dia quieres 6 meses o 2 anos, ese es el archivo a modificar.

## 7. Si quieres cambiar el archivo Excel que se descarga

Archivo principal:

`app/api/export/excel/route.ts`

Que puedes modificar ahi:

- nombre del archivo descargado
- hojas incluidas
- columnas exportadas
- orden de datos
- formato de resumen

## 8. Si quieres cambiar el comportamiento del login

Revisar:

- `app/api/auth/login/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/session/route.ts`
- `lib/auth.ts`

Que puedes cambiar ahi:

- validacion del acceso
- duracion de sesion
- nombre de cookie
- cierre de sesion

## 9. Si quieres cambiar la organizacion por pestañas

Archivo principal:

`app/page.tsx`

Que puedes cambiar:

- orden de pestañas
- nombres de pestañas
- contenido de cada seccion
- botones dentro de cada pestaña

## 10. Si quieres cambiar el capital inicial editable

Revisar:

- `app/page.tsx`
- `lib/server-data.ts`
- `SUPABASE_CONFIGURACION_APP.sql`

Que puedes modificar:

- nombre del campo
- lugar donde se muestra
- si se guarda en Supabase
- valor inicial por defecto

## 11. Si quieres cambiar recibos o impresion

Archivo principal:

`app/page.tsx`

Que puedes cambiar:

- diseño del recibo
- datos impresos
- saldo restante
- nombre del negocio
- fecha y valor del pago

## 12. Si quieres cambiar validaciones o consultas a Supabase

Revisar:

- `lib/server-data.ts`
- `lib/auth.ts`
- rutas dentro de `app/api`

Aqui se toca:

- inserciones
- actualizaciones
- borrados
- consultas
- manejo de errores

## 13. Si quieres cambiar la estructura de la base de datos

Eso ya no se hace primero en Next.js sino en Supabase.

Debes revisar:

- tablas
- columnas
- RLS policies
- columnas generadas
- funciones SQL si las agregas

Archivos de apoyo dentro del proyecto:

- `SUPABASE_CONFIGURACION_APP.sql`
- `SUPABASE_CREDENCIALES_APP.sql`

## 14. Si quieres trabajar el proyecto en local

Comandos utiles:

```powershell
npm run dev
```

Para compilar:

```powershell
npm run build
```

## 15. Si quieres subir cambios otra vez a GitHub

Comandos basicos:

```powershell
git add .
git commit -m "Mi cambio"
git push
```

## 16. Si quieres publicar nuevamente en Vercel

Si el proyecto ya esta conectado a GitHub, normalmente solo necesitas:

```powershell
git push
```

Vercel detecta el cambio y vuelve a desplegar.

## 17. Archivo mas importante de toda la app

Si un dia no sabes por donde empezar, abre primero:

`app/page.tsx`

Ese archivo concentra gran parte de:

- interfaz
- formularios
- pestañas
- dashboard
- clientes
- prestamos
- pagos
- botones
- mensajes visuales

## 18. Recomendacion practica

Antes de tocar algo grande:

1. Haz una copia de seguridad del proyecto.
2. Descarga el Excel desde la app.
3. Si puedes, sube el estado actual a GitHub.
4. Luego haces el cambio.

## 19. Si algo se daña

Haz estas revisiones:

1. Mira si cambiaste `app/page.tsx`.
2. Revisa si faltan variables en `.env.local`.
3. Confirma que Supabase tenga las columnas correctas.
4. Ejecuta `npm run build` para ver errores.
5. Revisa Vercel si el fallo solo ocurre en linea.

## 20. Resumen rapido

Si quieres cambiar algo visual:

- `app/page.tsx`
- `app/globals.css`

Si quieres cambiar seguridad:

- `.env.local`
- `lib/auth.ts`
- `app/api/auth/...`

Si quieres cambiar reportes:

- `app/api/export/excel/route.ts`

Si quieres cambiar borrado automatico:

- `app/api/maintenance/cleanup/route.ts`

Si quieres cambiar datos guardados:

- `lib/server-data.ts`

Si quieres cambiar cosas de Supabase:

- panel de Supabase
- archivos `.sql` del proyecto
